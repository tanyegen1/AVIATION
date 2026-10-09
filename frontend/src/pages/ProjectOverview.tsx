import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { Document, Finding, Project } from '../types'
import ProjectTabs from '../components/ProjectTabs'
import { StatusBadge } from '../components/Badges'

export default function ProjectOverview() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [findings, setFindings] = useState<Finding[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function load() {
    if (!projectId) return
    Promise.all([api.getProject(projectId), api.listDocuments(projectId), api.listFindings(projectId)])
      .then(([p, docs, f]) => {
        setProject(p)
        setDocuments(docs)
        setFindings(f)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load project.'))
  }

  useEffect(load, [projectId])

  async function toggleSetting() {
    if (!project) return
    const updated = await api.updateProject(project.id, {
      require_maintenance_release_for_status_sheets: !project.require_maintenance_release_for_status_sheets,
    })
    setProject(updated)
    await api.rerunRules(project.id)
    load()
  }

  async function handleDelete() {
    if (!project) return
    await api.deleteProject(project.id)
    navigate('/')
  }

  if (error) return <div className="page"><div className="error-banner">{error}</div></div>
  if (!project) return <div className="page loading-state">Loading…</div>

  const processed = documents.filter((d) => d.status === 'processed').length
  const failed = documents.filter((d) => d.status === 'failed').length
  const openFindings = findings.filter((f) => f.status === 'open').length
  const staleFindings = findings.filter((f) => f.stale).length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{project.name}</h1>
          <div className="subtitle">{project.description || 'No description.'}</div>
        </div>
      </div>
      <ProjectTabs projectId={project.id} />

      <div className="card">
        <h2>Processing status</h2>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <Stat label="Documents" value={documents.length} />
          <Stat label="Processed" value={processed} />
          <Stat label="Failed" value={failed} />
          <Stat label="Open findings" value={openFindings} />
          <Stat label="Stale findings (need re-review)" value={staleFindings} />
        </div>
      </div>

      <div className="card">
        <h2>Review template settings</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, textTransform: 'none', fontWeight: 400 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={project.require_maintenance_release_for_status_sheets}
            onChange={toggleSetting}
          />
          Require a maintenance/release record for every component status sheet uploaded to this project
        </label>
        <p className="subtitle" style={{ marginTop: 8 }}>
          When enabled, a status sheet with no matching release record (by part number + serial number) will be
          flagged for review.
        </p>
      </div>

      <div className="card">
        <h2>Recent documents</h2>
        {documents.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📄</div>
            <p>No documents uploaded yet.</p>
            <button className="primary" onClick={() => navigate(`/projects/${project.id}/documents`)}>
              Upload documents
            </button>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Category</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {documents.slice(0, 6).map((d) => (
                <tr key={d.id} onClick={() => navigate(`/projects/${project.id}/documents/${d.id}`)} style={{ cursor: 'pointer' }}>
                  <td>{d.original_filename}</td>
                  <td>{d.document_category.replace(/_/g, ' ')}</td>
                  <td><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Danger zone</h2>
        <p className="subtitle">
          Deleting a project permanently removes its uploaded files and all derived extraction/review data.
        </p>
        {!confirmingDelete ? (
          <button className="danger" onClick={() => setConfirmingDelete(true)}>
            Delete project
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="danger" onClick={handleDelete}>
              Confirm delete
            </button>
            <button onClick={() => setConfirmingDelete(false)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--navy)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
    </div>
  )
}
