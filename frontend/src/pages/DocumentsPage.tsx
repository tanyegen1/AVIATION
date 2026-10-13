import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { StatusBadge } from '../components/Badges'
import { useShell } from '../shell/AppShell'
import type { Document } from '../types'
import { Icon, Spinner } from '../ui/Icon'
import { Modal, useFeedback } from '../ui/feedback'
import { Button, Callout, EmptyState, PageHeader, Progress, Skeleton, formatBytes, timeAgo } from '../ui/primitives'

const ACTIVE = new Set(['queued', 'processing'])

type UploadResult = { name: string; kind: 'ok' | 'warn' | 'err'; message: string }

export default function DocumentsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { status, refreshProject } = useShell()
  const { toast, confirm } = useFeedback()
  const [documents, setDocuments] = useState<Document[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<Document | null>(null)
  const prevStatus = useRef<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!projectId) return
    try {
      const docs = await api.listDocuments(projectId)
      // Announce transitions out of an active state (finished / failed / cancelled).
      for (const d of docs) {
        const before = prevStatus.current[d.id]
        if (before && ACTIVE.has(before) && !ACTIVE.has(d.status)) {
          const job = d.latest_job
          if (d.status === 'processed' && job?.status === 'cancelled') {
            toast('info', 'Processing cancelled', `${d.original_filename}: ${job.pages_processed} page(s) kept.`)
          } else if (d.status === 'processed') {
            const failed = job?.pages_failed ? ` · ${job.pages_failed} page(s) failed` : ''
            toast('success', 'Processing finished', `${d.original_filename} — ${job?.pages_processed ?? 0} page(s) processed${failed}`)
          } else if (d.status === 'failed') {
            toast('error', 'Processing failed', `${d.original_filename}: ${d.error_message ?? 'see document for details'}`)
          }
          refreshProject()
        }
      }
      prevStatus.current = Object.fromEntries(docs.map((d) => [d.id, d.status]))
      setDocuments(docs)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load documents.')
    }
  }, [projectId, toast, refreshProject])

  useEffect(() => {
    load()
  }, [load])

  // Poll while anything is queued or processing, so progress is live.
  const anyActive = documents?.some((d) => ACTIVE.has(d.status)) ?? false
  useEffect(() => {
    if (!anyActive) return
    const t = window.setInterval(load, 1200)
    return () => window.clearInterval(t)
  }, [anyActive, load])

  async function cancel(doc: Document) {
    if (!doc.latest_job) return
    try {
      await api.cancelJob(doc.latest_job.id)
      toast('info', 'Cancelling…', 'The current page will finish first.')
      load()
    } catch (e) {
      toast('error', 'Could not cancel', e instanceof ApiError ? e.message : undefined)
    }
  }

  async function remove(doc: Document) {
    const ok = await confirm({
      title: `Delete “${doc.original_filename}”?`,
      body: 'This removes the stored file and its extraction data from this project.',
      confirmLabel: 'Delete document',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.deleteDocument(doc.id)
      toast('success', 'Document deleted', doc.original_filename)
      refreshProject()
      load()
    } catch (e) {
      toast('error', 'Could not delete', e instanceof ApiError ? e.message : undefined)
    }
  }

  const liveAvailable = status?.live_mode_available ?? false

  return (
    <div className="page">
      <PageHeader
        title="Documents"
        subtitle="Upload PDFs, choose which pages to process, then open a document to review its extracted fields."
      />

      {status && !liveAvailable && (
        <Callout tone="demo" title="Demo — synthetic documents and simulated extraction">
          Only the bundled synthetic PDFs (<code>backend/fixtures/pdfs</code>) have simulated results. Your own PDFs are
          accepted and stored, but processing them in demo mode reports that live processing needs an API key — it is
          never silently simulated.
        </Callout>
      )}

      {projectId && <Dropzone projectId={projectId} onUploaded={() => { refreshProject(); load() }} />}

      {error && <div className="error-banner" style={{ marginTop: 16 }}>{error}</div>}

      <div className="section-title">
        <h2>
          {documents ? `${documents.length} document${documents.length === 1 ? '' : 's'}` : 'Documents'}
        </h2>
        {anyActive && (
          <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <Spinner size={12} /> Updating live
          </span>
        )}
      </div>

      <div className="card">
        {documents === null ? (
          <div className="card-pad">
            <Skeleton lines={4} />
          </div>
        ) : documents.length === 0 ? (
          <EmptyState icon="file" title="No documents yet">
            Drop PDFs into the area above to add them to this project.
          </EmptyState>
        ) : (
          <ul className="doc-list">
            {documents.map((d) => (
              <DocItem
                key={d.id}
                doc={d}
                projectId={projectId!}
                onProcess={() => setProcessing(d)}
                onCancel={() => cancel(d)}
                onDelete={() => remove(d)}
              />
            ))}
          </ul>
        )}
      </div>

      {processing && (
        <ProcessModal
          doc={processing}
          liveAvailable={liveAvailable}
          onClose={() => setProcessing(null)}
          onStarted={() => {
            setProcessing(null)
            prevStatus.current[processing.id] = 'queued'
            refreshProject()
            load()
          }}
        />
      )}
    </div>
  )
}

/* ---------------- Dropzone ---------------- */

function Dropzone({ projectId, onUploaded }: { projectId: string; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [results, setResults] = useState<UploadResult[]>([])
  const { toast } = useFeedback()

  async function upload(files: File[]) {
    if (!files.length || busy) return
    const out: UploadResult[] = []
    for (const [i, file] of files.entries()) {
      setBusy(`Uploading ${i + 1} of ${files.length} — ${file.name}`)
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        out.push({ name: file.name, kind: 'err', message: 'Not a PDF — only PDF files are accepted.' })
        continue
      }
      try {
        const doc = await api.uploadDocument(projectId, file)
        if (doc.status === 'duplicate') {
          out.push({ name: file.name, kind: 'warn', message: 'Duplicate of a file already in this project — stored, not processed.' })
        } else {
          out.push({ name: file.name, kind: 'ok', message: `${doc.page_count ?? '?'} page(s) · ready to process` })
        }
      } catch (e) {
        out.push({ name: file.name, kind: 'err', message: e instanceof ApiError ? e.message : 'Upload failed.' })
      }
    }
    setBusy(null)
    setResults(out)
    const ok = out.filter((r) => r.kind !== 'err').length
    if (ok) toast('success', `${ok} file${ok === 1 ? '' : 's'} uploaded`)
    if (out.some((r) => r.kind === 'err')) toast('error', 'Some files were rejected', 'See the upload results below.')
    onUploaded()
    if (input.current) input.current.value = ''
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    upload(Array.from(e.dataTransfer.files))
  }

  return (
    <div>
      <div
        className={`dropzone ${over ? 'is-over' : ''} ${busy ? 'is-busy' : ''}`}
        onClick={() => !busy && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      >
        <div className="dropzone-icon">{busy ? <Spinner size={20} /> : <Icon name="upload" size={22} />}</div>
        <div className="dropzone-title">
          {busy ?? (
            <>
              Drop PDFs here or <span className="link">browse</span>
            </>
          )}
        </div>
        <div className="dropzone-help">PDF only · password-protected or unreadable files are rejected with a reason</div>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => upload(Array.from(e.target.files ?? []))}
        />
      </div>

      {results.length > 0 && (
        <div className="card card-pad upload-results">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <strong style={{ fontSize: 13.5 }}>Upload results</strong>
            <button className="icon-btn" onClick={() => setResults([])} aria-label="Dismiss upload results">
              <Icon name="x" size={14} />
            </button>
          </div>
          {results.map((r, i) => (
            <div key={i} className={`upload-result ${r.kind}`}>
              <Icon name={r.kind === 'ok' ? 'checkCircle' : r.kind === 'warn' ? 'alert' : 'alertCircle'} />
              <span className="name">{r.name}</span>
              <span className="msg">{r.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- One document row ---------------- */

function DocItem({
  doc,
  projectId,
  onProcess,
  onCancel,
  onDelete,
}: {
  doc: Document
  projectId: string
  onProcess: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const job = doc.latest_job
  const active = ACTIVE.has(doc.status)
  const total = job ? job.page_end - job.page_start + 1 : 0
  const done = job ? job.pages_processed + job.pages_failed : 0
  const href = `/projects/${projectId}/documents/${doc.id}`

  return (
    <li className="doc-item">
      <div className="doc-main">
        <div className="doc-icon">
          <Icon name="file" />
        </div>
        <div style={{ minWidth: 0 }}>
          <Link to={href} className="doc-name">
            {doc.original_filename}
          </Link>
          <div className="doc-meta">
            <span>{doc.page_count ?? '?'} page{doc.page_count === 1 ? '' : 's'}</span>
            <span className="dot">{formatBytes(doc.size_bytes)}</span>
            <span className="dot">
              {doc.document_category === 'unknown_type' ? 'Unclassified' : doc.document_category.replace(/_/g, ' ')}
              {doc.category_source === 'ai_suggested' && ' (suggested)'}
            </span>
            <span className="dot">{timeAgo(doc.uploaded_at)}</span>
          </div>
        </div>
      </div>

      <div className="doc-status">
        {active && job ? (
          <>
            <div className="doc-status-line">
              <Spinner size={12} />
              {job.status === 'queued' ? 'Queued' : `Page ${Math.min(done + 1, total)} of ${total}`}
              {job.cancel_requested && ' · cancelling'}
              <span style={{ marginLeft: 'auto' }}>{job.mode === 'demo' ? 'Demo' : 'Live'}</span>
            </div>
            <Progress value={total ? done / total : 0} label={`Processing ${doc.original_filename}`} />
          </>
        ) : (
          <>
            <div className="doc-status-line">
              <StatusBadge status={doc.status} />
              {job && doc.status !== 'duplicate' && (
                <span>
                  {job.pages_processed}/{total} pages{job.pages_failed > 0 && ` · ${job.pages_failed} failed`}
                  {job.mode === 'demo' && ' · demo'}
                </span>
              )}
            </div>
            {doc.review && doc.review.total > 0 && (
              <div className="doc-review" title="Extracted fields with a reviewer decision">
                <Progress value={doc.review.reviewed / doc.review.total} tone="success" label={`Fields reviewed in ${doc.original_filename}`} />
                <span>
                  {doc.review.reviewed === doc.review.total
                    ? 'All fields reviewed'
                    : `${doc.review.reviewed}/${doc.review.total} fields reviewed`}
                </span>
              </div>
            )}
            {doc.status === 'duplicate' && <div className="doc-status-note">Same file as an earlier upload — not processed.</div>}
            {doc.status === 'failed' && doc.error_message && (
              <div className="doc-status-note is-error" title={doc.error_message}>
                {doc.error_message}
              </div>
            )}
            {doc.status === 'processed' && job && job.pages_failed > 0 && (
              <div className="doc-status-note is-error">
                Failed pages: {job.failed_pages.map((f) => f.page).join(', ')}
              </div>
            )}
          </>
        )}
      </div>

      <div className="doc-actions">
        {active ? (
          <Button size="sm" icon="stop" onClick={onCancel} disabled={job?.cancel_requested}>
            Cancel
          </Button>
        ) : doc.status !== 'duplicate' ? (
          <Button size="sm" variant={doc.status === 'uploaded' ? 'primary' : 'secondary'} icon={doc.status === 'uploaded' ? 'play' : 'refresh'} onClick={onProcess}>
            {doc.status === 'uploaded' ? 'Process' : doc.status === 'failed' ? 'Retry' : 'Reprocess'}
          </Button>
        ) : null}
        <Link to={href} className="icon-btn" title="Open document" aria-label="Open document">
          <Icon name="eye" />
        </Link>
        <button className="icon-btn is-danger" onClick={onDelete} disabled={active} title="Delete document" aria-label="Delete document">
          <Icon name="trash" />
        </button>
      </div>
    </li>
  )
}

/* ---------------- Process dialog ---------------- */

function ProcessModal({
  doc,
  liveAvailable,
  onClose,
  onStarted,
}: {
  doc: Document
  liveAvailable: boolean
  onClose: () => void
  onStarted: () => void
}) {
  const pages = doc.page_count ?? 1
  const [mode, setMode] = useState<'demo' | 'live'>(liveAvailable && doc.status !== 'uploaded' && doc.latest_job?.mode === 'live' ? 'live' : 'demo')
  const [start, setStart] = useState(1)
  const [end, setEnd] = useState(Math.min(pages, 5))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useFeedback()
  const reprocess = doc.status === 'processed'

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      await api.createJob(doc.id, { mode, page_start: start, page_end: end, force: reprocess })
      toast('info', 'Processing started', `${doc.original_filename} · pages ${start}–${end}`)
      onStarted()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start processing.')
      setSaving(false)
    }
  }

  const rangeValid = start >= 1 && end >= start && end <= pages

  return (
    <Modal title={reprocess ? 'Reprocess document' : 'Process document'} onClose={onClose} width={500}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
        <strong style={{ color: 'var(--text)' }}>{doc.original_filename}</strong> · {pages} page{pages === 1 ? '' : 's'}
      </p>

      <div className="form-row">
        <span className="field-label">Extraction mode</span>
        <div className="choice-grid">
          <button type="button" className={`choice ${mode === 'demo' ? 'is-on' : ''}`} onClick={() => setMode('demo')}>
            <span className="choice-title">Demo</span>
            <span className="choice-desc">Simulated results for the bundled synthetic PDFs only.</span>
          </button>
          <button
            type="button"
            className={`choice ${mode === 'live' ? 'is-on' : ''}`}
            onClick={() => setMode('live')}
            disabled={!liveAvailable}
          >
            <span className="choice-title">Live</span>
            <span className="choice-desc">
              {liveAvailable ? 'Real AI extraction via the configured API.' : 'Unavailable — no API key on the server.'}
            </span>
          </button>
        </div>
      </div>

      <div className="form-row">
        <span className="field-label">Pages to process</span>
        <div className="range-row">
          <input type="number" min={1} max={pages} value={start} onChange={(e) => setStart(Number(e.target.value))} aria-label="From page" />
          <span className="muted">to</span>
          <input type="number" min={1} max={pages} value={end} onChange={(e) => setEnd(Number(e.target.value))} aria-label="To page" />
          <span className="muted" style={{ fontSize: 12.5 }}>of {pages}</span>
        </div>
        <div className="field-help">Start with a few pages to check quality and control cost. Up to 20 pages per run.</div>
      </div>

      {reprocess && (
        <Callout tone="info">
          Reprocessing creates a new extraction run for these pages. Earlier results are kept in history; the review
          screen shows the newest run for each page.
        </Callout>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="modal-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="play" loading={saving} disabled={!rangeValid} onClick={submit}>
          Start processing
        </Button>
      </div>
    </Modal>
  )
}
