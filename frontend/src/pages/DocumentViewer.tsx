import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { Document, ExtractedField, ProcessingJob } from '../types'
import ProjectTabs from '../components/ProjectTabs'
import { StatusBadge, EvidenceBadge } from '../components/Badges'
import PdfViewer from '../components/PdfViewer'

export default function DocumentViewer() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>()
  const [doc, setDoc] = useState<Document | null>(null)
  const [fields, setFields] = useState<ExtractedField[]>([])
  const [jobs, setJobs] = useState<ProcessingJob[]>([])
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  function load() {
    if (!documentId) return
    Promise.all([api.getDocument(documentId), api.listFields(documentId), api.listJobs(documentId)])
      .then(([d, f, j]) => {
        setDoc(d)
        setFields(f)
        setJobs(j)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load document.'))
  }

  useEffect(load, [documentId])

  async function handleCategoryChange(category: string) {
    if (!documentId) return
    await api.updateDocumentCategory(documentId, category)
    load()
  }

  if (error) return <div className="page"><div className="error-banner">{error}</div></div>
  if (!doc || !projectId) return <div className="page loading-state">Loading…</div>

  const latestJob = jobs[0]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{doc.original_filename}</h1>
          <div className="subtitle">
            <StatusBadge status={doc.status} /> · {doc.page_count ?? '?'} pages ·{' '}
            {doc.is_scanned ? 'contains scanned pages' : 'digital text'}
          </div>
        </div>
      </div>
      <ProjectTabs projectId={projectId} />

      <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label>Document category</label>
          <select value={doc.document_category} onChange={(e) => handleCategoryChange(e.target.value)} style={{ width: 240 }}>
            <option value="unknown_type">Unknown / unclassified</option>
            <option value="component_status_sheet">Component status sheet</option>
            <option value="maintenance_release_record">Maintenance / release record</option>
          </select>
          <div className="field-meta">
            Source: {doc.category_source === 'manual' ? 'manually set' : doc.category_source === 'ai_suggested' ? 'AI-suggested (confirm if correct)' : 'not yet classified'}
          </div>
        </div>
        {latestJob && (
          <div>
            <label>Last processing run</label>
            <div style={{ fontSize: 13 }}>
              <StatusBadge status={latestJob.status} /> · {latestJob.pages_processed} processed, {latestJob.pages_failed} failed
              {latestJob.mode === 'demo' && <span className="badge" style={{ marginLeft: 6 }}>demo-simulated</span>}
            </div>
            {latestJob.error_message && <div className="field-meta">{latestJob.error_message}</div>}
            {latestJob.failed_pages.length > 0 && (
              <div className="field-meta">
                Failed pages: {latestJob.failed_pages.map((fp) => `${fp.page} (${fp.reason})`).join('; ')}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="split-view">
        <PdfViewer fileUrl={api.documentFileUrl(doc.id)} page={page} onPage={setPage} />

        <div className="card" style={{ margin: 0 }}>
          <h3>Extracted fields — page {page}</h3>
          <FieldList fields={fields.filter((f) => f.page_number === page)} onChange={load} onJump={setPage} />
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>
              Show all fields across all pages ({fields.length})
            </summary>
            <div style={{ marginTop: 10 }}>
              <FieldList fields={fields} onChange={load} onJump={setPage} showPage />
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}

function FieldList({
  fields,
  onChange,
  onJump,
  showPage,
}: {
  fields: ExtractedField[]
  onChange: () => void
  onJump: (p: number) => void
  showPage?: boolean
}) {
  if (fields.length === 0) {
    return <p className="subtitle">No fields extracted for this page yet.</p>
  }
  return (
    <div>
      {fields.map((f) => (
        <FieldRow key={f.id} field={f} onChange={onChange} onJump={onJump} showPage={showPage} />
      ))}
    </div>
  )
}

function FieldRow({
  field,
  onChange,
  onJump,
  showPage,
}: {
  field: ExtractedField
  onChange: () => void
  onJump: (p: number) => void
  showPage?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(field.corrected_value ?? field.effective_value ?? '')
  const [note, setNote] = useState('')

  async function save() {
    await api.correctField(field.id, value.trim() === '' ? null : value.trim(), note.trim() || undefined)
    setEditing(false)
    onChange()
  }

  async function confirm() {
    await api.confirmField(field.id)
    onChange()
  }

  async function flagUnreadable() {
    await api.flagFieldUnreadable(field.id, note.trim() || undefined)
    onChange()
  }

  const label = field.qualifier ? `${field.field_name} (${field.qualifier})` : field.field_name

  return (
    <div className="field-row">
      <div>
        <div className="field-name">{label.replace(/_/g, ' ')}</div>
        {showPage && (
          <div className="field-meta">
            <a onClick={() => onJump(field.page_number ?? 1)} style={{ cursor: 'pointer' }}>
              page {field.page_number ?? '?'}
            </a>
          </div>
        )}
        <div className="field-meta">
          <StatusBadge status={field.review_status} />
        </div>
      </div>
      <div>
        {!editing ? (
          <>
            <div>
              {field.effective_value ?? <em style={{ color: 'var(--muted)' }}>null (unreadable / not present)</em>}
            </div>
            {field.review_status === 'corrected' && (
              <div className="field-meta">original AI value: {field.raw_value ?? 'null'}</div>
            )}
            {field.evidence_text && <div className="field-meta">Evidence: “{field.evidence_text}”</div>}
            <div style={{ marginTop: 4 }}>
              <EvidenceBadge verification={field.evidence_verification} />
              {field.self_reported_confidence && (
                <span className="badge" style={{ marginLeft: 6 }}>
                  model confidence label: {field.self_reported_confidence}
                </span>
              )}
            </div>
          </>
        ) : (
          <div>
            <input type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Corrected value" />
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reviewer note (optional)"
              style={{ marginTop: 6 }}
            />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {!editing ? (
          <>
            <button className="small" onClick={() => setEditing(true)}>
              Correct
            </button>
            <button className="small" onClick={confirm}>
              Confirm
            </button>
            <button className="small" onClick={flagUnreadable}>
              Flag unreadable
            </button>
          </>
        ) : (
          <>
            <button className="small primary" onClick={save}>
              Save
            </button>
            <button className="small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
