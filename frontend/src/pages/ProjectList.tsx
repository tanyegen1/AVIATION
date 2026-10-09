import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { Project } from '../types'

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const navigate = useNavigate()

  function load() {
    api
      .listProjects()
      .then(setProjects)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load projects.'))
  }

  useEffect(load, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const project = await api.createProject(name.trim(), description.trim() || undefined)
      setCreating(false)
      setName('')
      setDescription('')
      navigate(`/projects/${project.id}`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create project.')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <div className="subtitle">
            A project groups the documents for one review engagement (e.g. one aircraft transition or one component batch).
          </div>
        </div>
        <button className="primary" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : '+ New project'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {creating && (
        <form className="card" onSubmit={handleCreate} style={{ maxWidth: 480 }}>
          <label htmlFor="name">Project name</label>
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div style={{ height: 10 }} />
          <label htmlFor="description">Description (optional)</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
          <div style={{ height: 14 }} />
          <button className="primary" type="submit">
            Create project
          </button>
        </form>
      )}

      {projects === null && !error && <div className="loading-state">Loading projects…</div>}

      {projects && projects.length === 0 && (
        <div className="empty-state card">
          <div className="icon">📁</div>
          <p>No projects yet. Create one to upload and review your first documents.</p>
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="project-grid">
          {projects.map((p) => (
            <div key={p.id} className="project-card" onClick={() => navigate(`/projects/${p.id}`)}>
              <h3>{p.name}</h3>
              <div className="meta">
                {p.document_count} document{p.document_count === 1 ? '' : 's'} · created{' '}
                {new Date(p.created_at).toLocaleDateString()}
              </div>
              {p.description && <div className="meta" style={{ marginTop: 6 }}>{p.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
