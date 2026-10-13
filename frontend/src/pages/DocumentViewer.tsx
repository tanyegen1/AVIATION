import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { EvidenceBadge, ReviewBadge, StatusBadge } from '../components/Badges'
import PdfViewer, { type PageStats } from '../components/PdfViewer'
import { useShell } from '../shell/AppShell'
import type { Document, ExtractedField } from '../types'
import { Icon } from '../ui/Icon'
import { Modal, useFeedback } from '../ui/feedback'
import { Button, Callout, EmptyState, Progress, Skeleton } from '../ui/primitives'

const GROUPS: { title: string; names: string[] }[] = [
  { title: 'Identity', names: ['aircraft_registration', 'part_number', 'serial_number', 'component_description'] },
  { title: 'Usage', names: ['flight_hours', 'flight_cycles', 'usage_basis'] },
  { title: 'Dates', names: ['date'] },
  { title: 'Maintenance', names: ['maintenance_action', 'work_order_reference', 'organization'] },
]
const GROUP_OF: Record<string, number> = Object.fromEntries(GROUPS.flatMap((g, i) => g.names.map((n) => [n, i])))

const ACTIVE = new Set(['queued', 'processing'])

const SHORTCUTS: [string[], string][] = [
  [['J'], 'Next field'],
  [['K'], 'Previous field'],
  [['C'], 'Confirm field'],
  [['E'], 'Correct field'],
  [['F'], 'Flag as unreadable'],
  [['N'], 'Jump to next unreviewed field'],
  [['[', ']'], 'Previous / next page'],
  [['Enter'], 'Save correction (while editing)'],
  [['Esc'], 'Cancel correction'],
  [['?'], 'Show these shortcuts'],
]

const isUnreviewed = (f: ExtractedField) => f.review_status === 'unreviewed'
const fieldLabel = (f: ExtractedField) =>
  (f.qualifier ? `${f.field_name} · ${f.qualifier}` : f.field_name).replace(/_/g, ' ')

// Review order: page by page, and within a page by field group.
function reviewOrder(a: ExtractedField, b: ExtractedField) {
  return (
    (a.page_number ?? 0) - (b.page_number ?? 0) ||
    (GROUP_OF[a.field_name] ?? 99) - (GROUP_OF[b.field_name] ?? 99) ||
    a.field_name.localeCompare(b.field_name)
  )
}

/** Scroll a field card into view inside the fields panel only, so the page
 *  header doesn't get scrolled away (desktop, where the panel scrolls). */
function revealInPanel(el: HTMLElement, mode: 'nearest' | 'center') {
  const panel = el.closest<HTMLElement>('.fields-panel')
  if (!panel || panel.scrollHeight <= panel.clientHeight || getComputedStyle(panel).overflowY === 'visible') {
    el.scrollIntoView({ block: mode, behavior: mode === 'center' ? 'smooth' : 'auto' })
    return
  }
  const head = panel.querySelector<HTMLElement>('.card-head')?.offsetHeight ?? 0
  const top = el.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop
  const bottom = top + el.offsetHeight
  const viewTop = panel.scrollTop + head
  const viewBottom = panel.scrollTop + panel.clientHeight
  let next = panel.scrollTop
  if (mode === 'center') next = top - head - (panel.clientHeight - head - el.offsetHeight) / 2
  else if (top < viewTop) next = top - head - 8
  else if (bottom > viewBottom) next = bottom - panel.clientHeight + 8
  if (next !== panel.scrollTop) panel.scrollTo({ top: Math.max(0, next), behavior: mode === 'center' ? 'smooth' : 'auto' })
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export default function DocumentViewer() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { refreshProject } = useShell()
  const { toast } = useFeedback()
  const [doc, setDoc] = useState<Document | null>(null)
  const [fields, setFields] = useState<ExtractedField[] | null>(null)
  const [siblings, setSiblings] = useState<Document[]>([])
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'page' | 'all'>('page')
  const [unreviewedOnly, setUnreviewedOnly] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(params.get('field'))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  const targetField = params.get('field')
  const page = Math.max(1, Number(params.get('page')) || 1)

  const setPage = useCallback(
    (p: number) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('page', String(p))
          next.delete('field')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const load = useCallback(() => {
    if (!documentId) return
    Promise.all([api.getDocument(documentId), api.listFields(documentId)])
      .then(([d, f]) => {
        setDoc(d)
        setFields(f)
        setError(null)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load document.'))
  }, [documentId])

  useEffect(load, [load])

  // Other documents in the project, for the prev/next switcher.
  useEffect(() => {
    if (!projectId) return
    api
      .listDocuments(projectId)
      .then((docs) => setSiblings(docs.filter((d) => d.status !== 'duplicate')))
      .catch(() => setSiblings([]))
  }, [projectId, documentId])

  // Reset per-document UI state when switching documents.
  useEffect(() => {
    setEditingId(null)
    setScope('page')
  }, [documentId])

  // Keep refreshing while this document is still being processed.
  const processing = doc ? ACTIVE.has(doc.status) : false
  useEffect(() => {
    if (!processing) return
    const t = window.setInterval(load, 1500)
    return () => window.clearInterval(t)
  }, [processing, load])

  // Deep link from a finding: ?field=<id> selects that field and jumps to
  // its page — once, so later selections aren't pulled back to it.
  const handledTarget = useRef<string | null>(null)
  useEffect(() => {
    if (!targetField || !fields || handledTarget.current === targetField) return
    const f = fields.find((x) => x.id === targetField)
    if (!f) return
    handledTarget.current = targetField
    setActiveId(f.id)
    if (f.page_number && f.page_number !== page) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('page', String(f.page_number))
          return next
        },
        { replace: true },
      )
    }
  }, [targetField, fields, page, setParams])

  const ordered = useMemo(() => [...(fields ?? [])].sort(reviewOrder), [fields])

  const visible = useMemo(
    () =>
      ordered.filter(
        (f) => (scope === 'all' || f.page_number === page) && (!unreviewedOnly || isUnreviewed(f) || f.id === activeId),
      ),
    [ordered, scope, page, unreviewedOnly, activeId],
  )

  const pageStats = useMemo(() => {
    const s: PageStats = {}
    for (const f of fields ?? []) {
      if (!f.page_number) continue
      const e = (s[f.page_number] ??= { total: 0, unreviewed: 0 })
      e.total += 1
      if (isUnreviewed(f)) e.unreviewed += 1
    }
    return s
  }, [fields])

  const activate = useCallback(
    (f: ExtractedField | undefined) => {
      if (!f) return
      setActiveId(f.id)
      if (f.page_number && f.page_number !== page) setPage(f.page_number)
    },
    [page, setPage],
  )

  /** Next unreviewed field after `fromId` in review order, wrapping around. */
  const nextUnreviewed = useCallback(
    (fromId: string | null, list: ExtractedField[] = ordered) => {
      const start = fromId ? list.findIndex((f) => f.id === fromId) : -1
      for (let i = 1; i <= list.length; i++) {
        const f = list[(start + i + list.length) % list.length]
        if (isUnreviewed(f) && f.id !== fromId) return f
      }
      return undefined
    },
    [ordered],
  )

  const applyUpdate = useCallback(
    (updated: ExtractedField, advance: boolean) => {
      const nextList = ordered.map((f) => (f.id === updated.id ? updated : f))
      setFields(nextList)
      setDoc((d) =>
        d && d.review
          ? { ...d, review: { ...d.review, reviewed: nextList.filter((f) => !isUnreviewed(f)).length } }
          : d,
      )
      refreshProject()
      if (advance && activeId === updated.id) {
        const next = nextUnreviewed(updated.id, nextList)
        if (next) activate(next)
      }
    },
    [ordered, refreshProject, activeId, nextUnreviewed, activate],
  )

  const runAction = useCallback(
    async (f: ExtractedField, action: () => Promise<ExtractedField>, success: string) => {
      setBusyId(f.id)
      try {
        const updated = await action()
        toast('success', success, fieldLabel(f))
        setEditingId(null)
        applyUpdate(updated, true)
      } catch (e) {
        toast('error', 'Could not save', e instanceof ApiError ? e.message : undefined)
      } finally {
        setBusyId(null)
      }
    },
    [toast, applyUpdate],
  )

  const confirmField = useCallback(
    (f: ExtractedField) => {
      if (f.review_status === 'confirmed') return
      runAction(f, () => api.confirmField(f.id), 'Field confirmed')
    },
    [runAction],
  )
  const flagField = useCallback(
    (f: ExtractedField) => {
      if (f.review_status === 'flagged_unreadable') return
      runAction(f, () => api.flagFieldUnreadable(f.id), 'Flagged as unreadable')
    },
    [runAction],
  )
  const saveCorrection = useCallback(
    (f: ExtractedField, value: string, note: string) =>
      runAction(f, () => api.correctField(f.id, value.trim() === '' ? null : value.trim(), note.trim() || undefined), 'Correction saved'),
    [runAction],
  )

  // Keyboard shortcuts. Ignored while typing or while any dialog is open.
  const keyState = useRef({ visible, activeId, editingId, page, numPages: doc?.page_count ?? 1 })
  keyState.current = { visible, activeId, editingId, page, numPages: doc?.page_count ?? 1 }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (document.querySelector('.modal-backdrop')) return
      const { visible, activeId, editingId, page, numPages } = keyState.current
      const idx = visible.findIndex((f) => f.id === activeId)
      const active = idx >= 0 ? visible[idx] : undefined
      const key = e.key
      if (key === '?') return setHelpOpen(true)
      if (editingId) return
      switch (key.toLowerCase()) {
        case 'j':
          activate(visible[Math.min(visible.length - 1, idx + 1)])
          break
        case 'k':
          activate(visible[Math.max(0, idx - 1)])
          break
        case 'c':
          if (active) confirmField(active)
          break
        case 'f':
          if (active) flagField(active)
          break
        case 'e':
          if (active) {
            e.preventDefault()
            setEditingId(active.id)
          }
          break
        case 'n': {
          const next = nextUnreviewed(activeId)
          if (next) activate(next)
          else toast('info', 'Nothing left to review', 'Every extracted field on this document has a reviewer decision.')
          break
        }
        case '[':
          if (page > 1) setPage(page - 1)
          break
        case ']':
          if (page < numPages) setPage(page + 1)
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activate, confirmField, flagField, nextUnreviewed, setPage, toast])

  async function changeCategory(category: string) {
    if (!documentId) return
    try {
      await api.updateDocumentCategory(documentId, category)
      toast('success', 'Category updated', 'Checks were re-run for this project.')
      refreshProject()
      load()
    } catch (e) {
      toast('error', 'Could not update category', e instanceof ApiError ? e.message : undefined)
    }
  }

  if (error) {
    return (
      <div className="page">
        <div className="card">
          <EmptyState
            icon="alertCircle"
            title={error}
            action={
              <Link to={`/projects/${projectId}/documents`} className="btn btn-secondary btn-md">
                <Icon name="chevronLeft" size={16} /> Back to documents
              </Link>
            }
          >
            It may have been deleted from this project.
          </EmptyState>
        </div>
      </div>
    )
  }
  if (!doc || !fields) {
    return (
      <div className="page page-wide">
        <Skeleton lines={6} />
      </div>
    )
  }

  const job = doc.latest_job
  const reviewed = fields.filter((f) => !isUnreviewed(f)).length
  const allReviewed = fields.length > 0 && reviewed === fields.length
  const sibIdx = siblings.findIndex((d) => d.id === doc.id)
  const prevDoc = sibIdx > 0 ? siblings[sibIdx - 1] : undefined
  const nextDoc = sibIdx >= 0 && sibIdx < siblings.length - 1 ? siblings[sibIdx + 1] : undefined
  const nextNeedingReview = [...siblings.slice(sibIdx + 1), ...siblings.slice(0, Math.max(0, sibIdx))].find(
    (d) => d.review && d.review.reviewed < d.review.total,
  )
  const docHref = (d: Document) => `/projects/${projectId}/documents/${d.id}`
  const pageUnreviewed = pageStats[page]?.unreviewed ?? 0

  return (
    <div className="page page-wide review-page">
      <div className="review-head card">
        <div className="review-head-main">
          <div className="doc-switcher">
            <button
              className="icon-btn"
              disabled={!prevDoc}
              onClick={() => prevDoc && navigate(docHref(prevDoc))}
              aria-label="Previous document"
              title={prevDoc ? `Previous: ${prevDoc.original_filename}` : undefined}
            >
              <Icon name="chevronLeft" />
            </button>
            <span className="doc-switcher-pos">
              {sibIdx >= 0 ? `${sibIdx + 1} / ${siblings.length}` : '—'}
            </span>
            <button
              className="icon-btn"
              disabled={!nextDoc}
              onClick={() => nextDoc && navigate(docHref(nextDoc))}
              aria-label="Next document"
              title={nextDoc ? `Next: ${nextDoc.original_filename}` : undefined}
            >
              <Icon name="chevronRight" />
            </button>
          </div>
          <div className="review-title">
            <h1>{doc.original_filename}</h1>
            <div className="review-meta">
              <StatusBadge status={doc.status} />
              <span>
                {doc.page_count ?? '?'} page{doc.page_count === 1 ? '' : 's'} ·{' '}
                {doc.is_scanned ? 'contains scanned pages' : 'digital text'}
              </span>
              {job && (
                <span className="run-info">
                  · last run {job.pages_processed}/{job.page_end - job.page_start + 1} pages
                  {job.pages_failed > 0 && `, ${job.pages_failed} failed`}
                  {job.mode === 'demo' && ' · demo-simulated'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="review-head-side">
          <label className="review-category">
            <span>Category</span>
            <select value={doc.document_category} onChange={(e) => changeCategory(e.target.value)}>
              <option value="unknown_type">Unknown / unclassified</option>
              <option value="component_status_sheet">Component status sheet</option>
              <option value="maintenance_release_record">Maintenance / release record</option>
            </select>
            <small>
              {doc.category_source === 'manual'
                ? 'Set manually'
                : doc.category_source === 'ai_suggested'
                  ? 'Suggested by extraction — confirm it'
                  : 'Not classified yet'}
            </small>
          </label>
          {fields.length > 0 && (
            <div className="review-progress">
              <div className="review-progress-label">
                <strong>{reviewed}</strong> of {fields.length} fields reviewed
              </div>
              <Progress value={reviewed / fields.length} tone="success" />
            </div>
          )}
        </div>
      </div>

      {processing && (
        <Callout tone="info" title="Processing in progress">
          Fields appear here as each page finishes.
        </Callout>
      )}
      {job?.failed_pages && job.failed_pages.length > 0 && (
        <Callout tone="danger" title="Some pages failed to process">
          {job.failed_pages.map((fp) => `Page ${fp.page}: ${fp.reason}`).join(' · ')}
        </Callout>
      )}
      {doc.status === 'failed' && doc.error_message && (
        <Callout tone="danger" title="Processing failed">
          {doc.error_message}
        </Callout>
      )}

      <div className="viewer-layout">
        <PdfViewer fileUrl={api.documentFileUrl(doc.id)} page={page} onPage={setPage} pageStats={pageStats} />

        <div className="card fields-panel">
          <div className="card-head fields-head">
            <div className="chips">
              <button className={`chip ${scope === 'page' ? 'is-on' : ''}`} onClick={() => setScope('page')}>
                Page {page}
                <span className="chip-count">{pageStats[page]?.total ?? 0}</span>
              </button>
              <button className={`chip ${scope === 'all' ? 'is-on' : ''}`} onClick={() => setScope('all')}>
                All pages <span className="chip-count">{fields.length}</span>
              </button>
              <button
                className={`chip ${unreviewedOnly ? 'is-on' : ''}`}
                onClick={() => setUnreviewedOnly((v) => !v)}
                aria-pressed={unreviewedOnly}
              >
                Unreviewed
              </button>
            </div>
            <div className="fields-head-actions">
              {fields.length > 0 && !allReviewed && (
                <Button
                  size="sm"
                  icon="forward"
                  onClick={() => {
                    const next = nextUnreviewed(activeId)
                    if (next) {
                      setScope('page')
                      activate(next)
                    }
                  }}
                  title="Jump to the next unreviewed field (N)"
                >
                  Next
                </Button>
              )}
              <button className="icon-btn kbd-hint-btn" onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
                <Icon name="keyboard" />
              </button>
            </div>
          </div>

          {allReviewed && (
            <div className="review-done">
              <Icon name="checkCircle" size={18} />
              <div>
                <strong>Every extracted field on this document has a reviewer decision.</strong>
                {nextNeedingReview ? (
                  <div>
                    Next to review:{' '}
                    <Link to={docHref(nextNeedingReview)}>
                      {nextNeedingReview.original_filename} ({nextNeedingReview.review!.total - nextNeedingReview.review!.reviewed} left)
                    </Link>
                  </div>
                ) : (
                  <div>No other document in this project has unreviewed fields.</div>
                )}
              </div>
            </div>
          )}

          {visible.length === 0 ? (
            <EmptyState
              icon={fields.length === 0 ? 'file' : unreviewedOnly ? 'checkCircle' : 'search'}
              title={
                fields.length === 0
                  ? 'No fields extracted yet'
                  : unreviewedOnly
                    ? scope === 'page'
                      ? `Nothing left to review on page ${page}`
                      : 'Nothing left to review'
                    : `Nothing extracted on page ${page}`
              }
            >
              {fields.length === 0 ? (
                <>
                  Process this document to extract its fields.
                  {!processing && (
                    <div style={{ marginTop: 12 }}>
                      <Link to={`/projects/${projectId}/documents`} className="btn btn-secondary btn-sm">
                        <Icon name="play" size={14} /> Go to processing
                      </Link>
                    </div>
                  )}
                </>
              ) : scope === 'page' && fields.some(isUnreviewed) ? (
                'Press N or use “Next” to jump to the next field that needs review.'
              ) : (
                'Try another page, or switch to “All pages”.'
              )}
            </EmptyState>
          ) : (
            <div className="fields-list" role="list">
              {GROUPS.map((g) => {
                const items = visible.filter((f) => g.names.includes(f.field_name))
                if (!items.length) return null
                return (
                  <div key={g.title} role="presentation">
                    <div className="field-group-title">{g.title}</div>
                    {items.map((f) => (
                      <FieldCard
                        key={f.id}
                        field={f}
                        showPage={scope === 'all'}
                        isActive={f.id === activeId}
                        isTarget={f.id === targetField}
                        editing={f.id === editingId}
                        busy={f.id === busyId}
                        onSelect={() => setActiveId(f.id)}
                        onJump={setPage}
                        onConfirm={() => confirmField(f)}
                        onFlag={() => flagField(f)}
                        onEdit={() => {
                          setActiveId(f.id)
                          setEditingId(f.id)
                        }}
                        onCancelEdit={() => setEditingId(null)}
                        onSave={(value, note) => saveCorrection(f, value, note)}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {scope === 'page' && pageUnreviewed === 0 && fields.some(isUnreviewed) && visible.length > 0 && (
            <div className="fields-foot muted">
              Page {page} is done. Press <kbd>N</kbd> for the next unreviewed field.
            </div>
          )}
        </div>
      </div>

      {helpOpen && (
        <Modal title="Keyboard shortcuts" onClose={() => setHelpOpen(false)} width={420}>
          <table className="shortcut-table">
            <tbody>
              {SHORTCUTS.map(([keys, label]) => (
                <tr key={label}>
                  <td>
                    {keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </td>
                  <td>{label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="faint" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Confirming, correcting or flagging the selected field moves on to the next unreviewed one.
          </p>
        </Modal>
      )}
    </div>
  )
}

function FieldCard({
  field,
  showPage,
  isActive,
  isTarget,
  editing,
  busy,
  onSelect,
  onJump,
  onConfirm,
  onFlag,
  onEdit,
  onCancelEdit,
  onSave,
}: {
  field: ExtractedField
  showPage: boolean
  isActive: boolean
  isTarget: boolean
  editing: boolean
  busy: boolean
  onSelect: () => void
  onJump: (p: number) => void
  onConfirm: () => void
  onFlag: () => void
  onEdit: () => void
  onCancelEdit: () => void
  onSave: (value: string, note: string) => void
}) {
  const [value, setValue] = useState(field.corrected_value ?? field.effective_value ?? '')
  const [note, setNote] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing) {
      setValue(field.corrected_value ?? field.effective_value ?? '')
      setNote('')
    }
  }, [editing, field.corrected_value, field.effective_value])

  useEffect(() => {
    if (isTarget && ref.current) revealInPanel(ref.current, 'center')
  }, [isTarget])
  useEffect(() => {
    if (isActive && ref.current) revealInPanel(ref.current, 'nearest')
  }, [isActive])

  const editKeys = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancelEdit()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onSave(value, note)
    }
  }

  return (
    <div
      ref={ref}
      role="listitem"
      className={`field-card rs-${field.review_status} ${isActive ? 'is-active' : ''} ${isTarget && isActive ? 'is-target' : ''}`}
      onClick={onSelect}
    >
      <div className="field-top">
        <div className="field-name">
          {fieldLabel(field)}
          {showPage && field.page_number && (
            <button
              className="chip chip-mini"
              onClick={(e) => {
                e.stopPropagation()
                onJump(field.page_number!)
              }}
            >
              p.{field.page_number}
            </button>
          )}
        </div>
        {!editing && (
          <div className="field-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="icon-btn is-success"
              title="Confirm value (C)"
              aria-label="Confirm value"
              disabled={busy || field.review_status === 'confirmed'}
              onClick={onConfirm}
            >
              <Icon name="check" />
            </button>
            <button className="icon-btn" title="Correct value (E)" aria-label="Correct value" disabled={busy} onClick={onEdit}>
              <Icon name="edit" />
            </button>
            <button
              className="icon-btn is-warning"
              title="Flag as unreadable (F)"
              aria-label="Flag as unreadable"
              disabled={busy || field.review_status === 'flagged_unreadable'}
              onClick={onFlag}
            >
              <Icon name="flag" />
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        <>
          <div className={`field-value ${field.effective_value === null ? 'is-null' : ''}`}>
            {field.effective_value ?? (field.review_status === 'flagged_unreadable' ? 'Flagged unreadable' : 'Not readable — left empty')}
          </div>
          {field.review_status === 'corrected' && (
            <div className="field-original">
              Original extracted value: <s>{field.raw_value ?? 'empty'}</s>
              {field.corrected_note && ` · “${field.corrected_note}”`}
            </div>
          )}
          {field.evidence_text && <div className="field-evidence">“{field.evidence_text}”</div>}
          <div className="field-tags">
            <ReviewBadge status={field.review_status} />
            <EvidenceBadge verification={field.evidence_verification} />
            {field.self_reported_confidence && (
              <span className="badge" title="The model's own label — not a measured probability">
                model label: {field.self_reported_confidence}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="field-edit" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={editKeys}
            placeholder="Corrected value (leave empty if not readable)"
            aria-label="Corrected value"
            autoFocus
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={editKeys}
            placeholder="Reviewer note (optional)"
            aria-label="Reviewer note"
          />
          <div className="muted" style={{ fontSize: 12 }}>
            The original extracted value is kept on record. Findings that cite this field will be marked for re-review.
          </div>
          <div className="field-edit-actions">
            <Button size="sm" onClick={onCancelEdit}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" loading={busy} onClick={() => onSave(value, note)}>
              Save correction
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
