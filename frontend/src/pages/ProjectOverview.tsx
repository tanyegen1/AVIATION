import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { StatusBadge } from '../components/Badges'
import { useShell } from '../shell/AppShell'
import type { Document } from '../types'
import { Icon } from '../ui/Icon'
import { useFeedback } from '../ui/feedback'
import { Button, EmptyState, PageHeader, Progress, Skeleton, timeAgo } from '../ui/primitives'

export default function ProjectOverview() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { project, summary, refreshProject } = useShell()
  const { toast, confirm } = useFeedback()
  const [documents, setDocuments] = useState<Document[] | null>(null)
  const [savingSetting, setSavingSetting] = useState(false)

  useEffect(() => {
    if (!projectId) return
    api.listDocuments(projectId).then(setDocuments).catch(() => setDocuments([]))
  }, [projectId])

  async function toggleSetting() {
    if (!project) return
    setSavingSetting(true)
    try {
      await api.updateProject(project.id, {
        require_maintenance_release_for_status_sheets: !project.require_maintenance_release_for_status_sheets,
      })
      await api.rerunRules(project.id)
      refreshProject()
      toast('success', 'Review template updated', 'Checks were re-run with the new setting.')
    } catch (e) {
      toast('error', 'Could not update setting', e instanceof ApiError ? e.message : undefined)
    } finally {
      setSavingSetting(false)
    }
  }

  async function handleDelete() {
    if (!project) return
    const ok = await confirm({
      title: `Delete “${project.name}”?`,
      body: 'This permanently removes every uploaded file and all extraction and review data in this project. It cannot be undone.',
      confirmLabel: 'Delete project',
      tone: 'danger',
    })
    if (!ok) return
    await api.deleteProject(project.id)
    toast('success', 'Project deleted')
    navigate('/projects')
  }

  if (!project || !summary) {
    return (
      <div className="page">
        <Skeleton lines={5} />
      </div>
    )
  }

  const s = summary
  const reviewedPct = s.fields.total ? s.fields.reviewed / s.fields.total : 0

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <>
            <Icon name="clock" size={13} /> Created {timeAgo(project.created_at)}
          </>
        }
        title={project.name}
        subtitle={project.description || undefined}
        actions={
          <Button variant="primary" icon="upload" onClick={() => navigate(`/projects/${project.id}/documents`)}>
            Upload documents
          </Button>
        }
      />

      <div className="stat-grid">
        <div className="card stat">
          <div className="stat-label">
            <Icon name="file" size={14} /> Documents
          </div>
          <div className="stat-value">{s.documents.total}</div>
          <div className="stat-sub">
            {s.documents.processed} processed
            {s.documents.failed > 0 && ` · ${s.documents.failed} failed`}
            {s.documents.active > 0 && ` · ${s.documents.active} processing`}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">
            <Icon name="checkCircle" size={14} /> Fields reviewed
          </div>
          <div className="stat-value">
            {s.fields.reviewed}
            <span className="faint" style={{ fontSize: 16 }}> / {s.fields.total}</span>
          </div>
          <Progress value={reviewedPct} tone="success" />
        </div>
        <Link to={`/projects/${project.id}/findings?view=matches`} className="card stat stat-link">
          <div className="stat-label">
            <Icon name="link" size={14} /> Matches to confirm
          </div>
          <div className="stat-value">{s.matches.suggested}</div>
          <div className="stat-sub">
            {s.matches.confirmed} confirmed · {s.matches.rejected} rejected
          </div>
        </Link>
        <Link to={`/projects/${project.id}/findings`} className="card stat stat-link">
          <div className="stat-label">
            <Icon name="alert" size={14} /> Open findings
          </div>
          <div className="stat-value">{s.findings.open}</div>
          <div className="stat-sub">
            {s.findings.stale > 0 ? `${s.findings.stale} need re-review` : `${s.findings.total} total`}
          </div>
        </Link>
      </div>

      <div className="section-title">
        <h2>Recent documents</h2>
        <Link to={`/projects/${project.id}/documents`} className="muted">
          View all →
        </Link>
      </div>
      <div className="card">
        {documents === null ? (
          <div className="card-pad">
            <Skeleton lines={3} />
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon="upload"
            title="No documents yet"
            action={
              <Button variant="primary" icon="upload" onClick={() => navigate(`/projects/${project.id}/documents`)}>
                Upload documents
              </Button>
            }
          >
            Upload component status sheets or maintenance/release records (PDF) to start.
          </EmptyState>
        ) : (
          <ul className="doc-list">
            {documents.slice(0, 5).map((d) => (
              <li key={d.id} className="doc-item" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <div className="doc-main">
                  <div className="doc-icon">
                    <Icon name="file" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/projects/${project.id}/documents/${d.id}`} className="doc-name">
                      {d.original_filename}
                    </Link>
                    <div className="doc-meta">
                      <span>{d.document_category.replace(/_/g, ' ')}</span>
                      <span className="dot">{timeAgo(d.uploaded_at)}</span>
                    </div>
                  </div>
                </div>
                <StatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="section-title">
        <h2>Review template</h2>
      </div>
      <div className="card card-pad">
        <label className="check-row">
          <input
            type="checkbox"
            checked={project.require_maintenance_release_for_status_sheets}
            onChange={toggleSetting}
            disabled={savingSetting}
          />
          <span>
            <strong>Require a maintenance/release record for every component status sheet</strong>
            <br />
            <span className="muted" style={{ fontSize: 13 }}>
              When on, a status sheet with no release record sharing its part number and serial number is flagged
              for review. Changing this re-runs the checks.
            </span>
          </span>
        </label>
      </div>

      <div className="section-title">
        <h2>Danger zone</h2>
      </div>
      <div className="card card-pad danger-zone" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>Delete this project</strong>
          <div className="muted" style={{ fontSize: 13 }}>
            Permanently removes its uploaded files and all derived extraction and review data.
          </div>
        </div>
        <Button variant="danger" icon="trash" onClick={handleDelete}>
          Delete project
        </Button>
      </div>
    </div>
  )
}
