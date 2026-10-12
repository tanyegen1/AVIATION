import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { Project } from '../types'
import { Icon } from '../ui/Icon'
import { Modal, useFeedback } from '../ui/feedback'
import { Button, EmptyState, PageHeader, Skeleton, timeAgo } from '../ui/primitives'

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load projects.'))
  }, [])

  return (
    <div className="page">
      <PageHeader
        title="Projects"
        subtitle="A project groups the documents for one review engagement — for example one aircraft transition or one component batch."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            New project
          </Button>
        }
      />

      {error && <div className="error-banner">{error}</div>}

      {projects === null && !error && (
        <div className="card card-pad">
          <Skeleton lines={3} />
        </div>
      )}

      {projects && projects.length === 0 && (
        <div className="card">
          <EmptyState
            icon="folder"
            title="No projects yet"
            action={
              <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                Create your first project
              </Button>
            }
          >
            Create a project, upload component status sheets or release records, and start reviewing.
          </EmptyState>
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="project-grid">
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card project-card">
              <div className="project-card-top">
                <div className="project-card-icon">
                  <Icon name="folder" size={18} />
                </div>
                <h3>{p.name}</h3>
              </div>
              <p>{p.description || 'No description.'}</p>
              <div className="project-card-meta">
                <span>
                  <Icon name="file" size={14} />
                  {p.document_count} document{p.document_count === 1 ? '' : 's'}
                </span>
                <span>
                  <Icon name="clock" size={14} />
                  {timeAgo(p.created_at)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}
    </div>
  )
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const { toast } = useFeedback()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const project = await api.createProject(name.trim(), description.trim() || undefined)
      toast('success', 'Project created', project.name)
      navigate(`/projects/${project.id}/documents`)
    } catch (err) {
      toast('error', 'Could not create project', err instanceof ApiError ? err.message : undefined)
      setSaving(false)
    }
  }

  return (
    <Modal title="New project" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <label className="field-label" htmlFor="name">
            Project name
          </label>
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. A320 MSN 1234 transition" />
        </div>
        <div className="form-row">
          <label className="field-label" htmlFor="description">
            Description <span className="faint">(optional)</span>
          </label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!name.trim()}>
            Create project
          </Button>
        </div>
      </form>
    </Modal>
  )
}
