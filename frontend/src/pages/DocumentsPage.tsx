import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { ApiStatus, Document, Project } from '../types'
import ProjectTabs from '../components/ProjectTabs'
import { StatusBadge } from '../components/Badges'

export default function DocumentsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [status, setStatus] = useState<ApiStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function load() {
    if (!projectId) return
    Promise.all([api.getProject(projectId), api.listDocuments(projectId), api.status()])
      .then(([p, docs, s]) => {
        setProject(p)
        setDocuments(docs)
        setStatus(s)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load documents.'))
  }

  useEffect(load, [projectId])

  async function handleFiles(files: FileList | null) {
    if (!files || !projectId) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        await api.uploadDocument(projectId, file)
      }
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  if (!project) return <div className="page loading-state">Loading…</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Documents</h1>
          <div className="subtitle">Upload PDFs, then process each one to extract structured fields.</div>
        </div>
      </div>
      <ProjectTabs projectId={project.id} />

      {status && !status.live_mode_available && (
        <div className="demo-banner">
          <strong>Demo mode — synthetic documents and simulated extraction.</strong> No ANTHROPIC_API_KEY is
          configured on the server, so only the bundled demo PDFs (see <code>backend/fixtures/pdfs</code>) will
          produce simulated results. Uploading your own PDF will be accepted and stored, but processing it in demo
          mode will report that live processing requires an API key — it is never silently simulated.
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Upload</h2>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          multiple
          disabled={uploading}
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading && <p className="subtitle">Uploading…</p>}
      </div>

      <div className="card">
        <h2>Documents ({documents.length})</h2>
        {documents.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📄</div>
            <p>No documents uploaded yet.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Category</th>
                <th>Pages</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <DocRow key={d.id} doc={d} liveAvailable={status?.live_mode_available ?? false} onChange={load} onOpen={() => navigate(`/projects/${project.id}/documents/${d.id}`)} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function DocRow({
  doc,
  liveAvailable,
  onChange,
  onOpen,
}: {
  doc: Document
  liveAvailable: boolean
  onChange: () => void
  onOpen: () => void
}) {
  const [mode, setMode] = useState<'demo' | 'live'>('demo')
  const [pageStart, setPageStart] = useState(1)
  const [pageEnd, setPageEnd] = useState(Math.min(doc.page_count ?? 1, 5))
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function process(force = false) {
    setBusy(true)
    setLocalError(null)
    try {
      await api.createJob(doc.id, { mode, page_start: pageStart, page_end: pageEnd, force })
      onChange()
    } catch (e) {
      setLocalError(e instanceof ApiError ? e.message : 'Failed to start processing.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete "${doc.original_filename}"? This removes its file and extraction data.`)) return
    await api.deleteDocument(doc.id)
    onChange()
  }

  return (
    <tr>
      <td>
        <a onClick={onOpen} style={{ cursor: 'pointer' }}>
          {doc.original_filename}
        </a>
        {doc.status === 'duplicate' && <div className="field-meta">Duplicate of an existing upload in this project.</div>}
        {localError && <div className="error-banner" style={{ marginTop: 6 }}>{localError}</div>}
      </td>
      <td>{doc.document_category.replace(/_/g, ' ')}</td>
      <td>{doc.page_count ?? '-'}</td>
      <td><StatusBadge status={doc.status} /></td>
      <td>
        {doc.status !== 'duplicate' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select value={mode} onChange={(e) => setMode(e.target.value as 'demo' | 'live')} style={{ width: 80 }} disabled={busy}>
              <option value="demo">Demo</option>
              <option value="live" disabled={!liveAvailable}>
                Live
              </option>
            </select>
            <input
              type="number"
              min={1}
              value={pageStart}
              onChange={(e) => setPageStart(Number(e.target.value))}
              style={{ width: 50 }}
              disabled={busy}
            />
            <span>-</span>
            <input
              type="number"
              min={1}
              value={pageEnd}
              onChange={(e) => setPageEnd(Number(e.target.value))}
              style={{ width: 50 }}
              disabled={busy}
            />
            <button className="small primary" disabled={busy} onClick={() => process(doc.status === 'processed')}>
              {doc.status === 'processed' ? 'Reprocess' : 'Process'}
            </button>
            <button className="small danger" onClick={remove} disabled={busy}>
              Delete
            </button>
          </div>
        )}
        {doc.status === 'duplicate' && (
          <button className="small danger" onClick={remove}>
            Delete
          </button>
        )}
      </td>
    </tr>
  )
}
