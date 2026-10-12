import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { EvidenceBadge, StatusBadge } from '../components/Badges'
import PdfViewer from '../components/PdfViewer'
import { useShell } from '../shell/AppShell'
import type { Document, ExtractedField } from '../types'
import { Icon } from '../ui/Icon'
import { useFeedback } from '../ui/feedback'
import { Button, Callout, EmptyState, PageHeader, Skeleton } from '../ui/primitives'

const GROUPS: { title: string; names: string[] }[] = [
  { title: 'Identity', names: ['aircraft_registration', 'part_number', 'serial_number', 'component_description'] },
  { title: 'Usage', names: ['flight_hours', 'flight_cycles', 'usage_basis'] },
  { title: 'Dates', names: ['date'] },
  { title: 'Maintenance', names: ['maintenance_action', 'work_order_reference', 'organization'] },
]

const ACTIVE = new Set(['queued', 'processing'])

export default function DocumentViewer() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>()
  const [params, setParams] = useSearchParams()
  const { refreshProject } = useShell()
  const { toast } = useFeedback()
  const [doc, setDoc] = useState<Document | null>(null)
  const [fields, setFields] = useState<ExtractedField[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'page' | 'all'>('page')

  const targetField = params.get('field')
  const page = Math.max(1, Number(params.get('page')) || 1)

  const setPage = useCallback(
    (p: number) => {
      const next = new URLSearchParams(params)
      next.set('page', String(p))
      next.delete('field')
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const load = useCallback(() => {
    if (!documentId) return
    Promise.all([api.getDocument(documentId), api.listFields(documentId)])
      .then(([d, f]) => {
        setDoc(d)
        setFields(f)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load document.'))
  }, [documentId])

  useEffect(load, [load])

  // Keep refreshing while this document is still being processed.
  const active = doc ? ACTIVE.has(doc.status) : false
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(load, 1500)
    return () => window.clearInterval(t)
  }, [active, load])

  // Deep link from a finding: ?field=<id> jumps to that field's page.
  useEffect(() => {
    if (!targetField || !fields) return
    const f = fields.find((x) => x.id === targetField)
    if (f?.page_number && f.page_number !== page) {
      const next = new URLSearchParams(params)
      next.set('page', String(f.page_number))
      setParams(next, { replace: true })
    }
  }, [targetField, fields, page, params, setParams])

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

  const visible = useMemo(
    () => (fields ?? []).filter((f) => scope === 'all' || f.page_number === page),
    [fields, scope, page],
  )

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
  const reviewed = fields.filter((f) => f.review_status !== 'unreviewed').length

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow={
          <>
            <StatusBadge status={doc.status} />
            <span>
              {doc.page_count ?? '?'} page{doc.page_count === 1 ? '' : 's'} · {doc.is_scanned ? 'contains scanned pages' : 'digital text'}
            </span>
            {job && (
              <span>
                · last run {job.pages_processed}/{job.page_end - job.page_start + 1} pages
                {job.pages_failed > 0 && `, ${job.pages_failed} failed`}
                {job.mode === 'demo' && ' · demo-simulated'}
              </span>
            )}
          </>
        }
        title={doc.original_filename}
        actions={
          <div style={{ minWidth: 240 }}>
            <label className="field-label" htmlFor="category">
              Document category
            </label>
            <select id="category" value={doc.document_category} onChange={(e) => changeCategory(e.target.value)}>
              <option value="unknown_type">Unknown / unclassified</option>
              <option value="component_status_sheet">Component status sheet</option>
              <option value="maintenance_release_record">Maintenance / release record</option>
            </select>
            <div className="field-help">
              {doc.category_source === 'manual'
                ? 'Set manually.'
                : doc.category_source === 'ai_suggested'
                  ? 'Suggested by extraction — confirm it is right.'
                  : 'Not classified yet.'}
            </div>
          </div>
        }
      />

      {active && (
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
        <PdfViewer fileUrl={api.documentFileUrl(doc.id)} page={page} onPage={setPage} />

        <div className="card fields-panel">
          <div className="card-head">
            <div>
              <h3>Extracted fields</h3>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {reviewed} of {fields.length} reviewed
              </div>
            </div>
            <div className="chips">
              <button className={`chip ${scope === 'page' ? 'is-on' : ''}`} onClick={() => setScope('page')}>
                Page {page}
              </button>
              <button className={`chip ${scope === 'all' ? 'is-on' : ''}`} onClick={() => setScope('all')}>
                All pages <span className="chip-count">{fields.length}</span>
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon="file" title={fields.length === 0 ? 'No fields extracted yet' : `Nothing extracted on page ${page}`}>
              {fields.length === 0
                ? 'Process this document from the Documents screen to extract its fields.'
                : 'Try another page, or switch to “All pages”.'}
            </EmptyState>
          ) : (
            GROUPS.map((g) => {
              const items = visible.filter((f) => g.names.includes(f.field_name))
              if (!items.length) return null
              return (
                <div key={g.title}>
                  <div className="field-group-title">{g.title}</div>
                  {items.map((f) => (
                    <FieldCard
                      key={f.id}
                      field={f}
                      showPage={scope === 'all'}
                      isTarget={f.id === targetField}
                      onJump={setPage}
                      onChanged={() => {
                        refreshProject()
                        load()
                      }}
                    />
                  ))}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function FieldCard({
  field,
  showPage,
  isTarget,
  onJump,
  onChanged,
}: {
  field: ExtractedField
  showPage: boolean
  isTarget: boolean
  onJump: (p: number) => void
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(field.corrected_value ?? field.effective_value ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { toast } = useFeedback()

  useEffect(() => {
    if (isTarget) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [isTarget])

  const label = (field.qualifier ? `${field.field_name} · ${field.qualifier}` : field.field_name).replace(/_/g, ' ')

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      toast('success', success, label)
      setEditing(false)
      onChanged()
    } catch (e) {
      toast('error', 'Could not save', e instanceof ApiError ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className={`field-card ${isTarget ? 'is-target' : ''}`}>
      <div className="field-top">
        <div className="field-name">
          {label}
          {showPage && field.page_number && (
            <button className="chip" style={{ height: 22, padding: '0 8px', fontSize: 11 }} onClick={() => onJump(field.page_number!)}>
              p.{field.page_number}
            </button>
          )}
        </div>
        {!editing && (
          <div className="field-actions">
            <button
              className="icon-btn is-success"
              title="Confirm value"
              aria-label="Confirm value"
              disabled={busy || field.review_status === 'confirmed'}
              onClick={() => run(() => api.confirmField(field.id), 'Field confirmed')}
            >
              <Icon name="check" />
            </button>
            <button className="icon-btn" title="Correct value" aria-label="Correct value" disabled={busy} onClick={() => setEditing(true)}>
              <Icon name="edit" />
            </button>
            <button
              className="icon-btn is-warning"
              title="Flag as unreadable"
              aria-label="Flag as unreadable"
              disabled={busy || field.review_status === 'flagged_unreadable'}
              onClick={() => run(() => api.flagFieldUnreadable(field.id), 'Flagged as unreadable')}
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
            <StatusBadge status={field.review_status} />
            <EvidenceBadge verification={field.evidence_verification} />
            {field.self_reported_confidence && (
              <span className="badge" title="The model's own label — not a measured probability">
                model label: {field.self_reported_confidence}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="field-edit">
          <input type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Corrected value" autoFocus />
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reviewer note (optional)" />
          <div className="muted" style={{ fontSize: 12 }}>
            The original extracted value is kept on record. Findings that cite this field will be marked for re-review.
          </div>
          <div className="field-edit-actions">
            <Button size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              onClick={() =>
                run(() => api.correctField(field.id, value.trim() === '' ? null : value.trim(), note.trim() || undefined), 'Correction saved')
              }
            >
              Save correction
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
