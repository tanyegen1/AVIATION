import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { Document, Finding } from '../types'
import ProjectTabs from '../components/ProjectTabs'
import { SeverityBadge, StatusBadge } from '../components/Badges'

export default function FindingDetail() {
  const { projectId, findingId } = useParams<{ projectId: string; findingId: string }>()
  const navigate = useNavigate()
  const [finding, setFinding] = useState<Finding | null>(null)
  const [docsById, setDocsById] = useState<Record<string, Document>>({})
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function load() {
    if (!findingId || !projectId) return
    api
      .getFinding(findingId)
      .then((f) => {
        setFinding(f)
        setNote(f.reviewer_note ?? '')
        return api.listDocuments(projectId)
      })
      .then((docs) => setDocsById(Object.fromEntries(docs.map((d) => [d.id, d]))))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load finding.'))
  }

  useEffect(load, [findingId, projectId])

  async function decide(status: 'confirmed' | 'dismissed' | 'resolved') {
    if (!findingId) return
    await api.decideFinding(findingId, status, note.trim() || undefined)
    load()
  }

  if (error) return <div className="page"><div className="error-banner">{error}</div></div>
  if (!finding || !projectId) return <div className="page loading-state">Loading…</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>
            {finding.title}
            {finding.stale && <span className="stale-tag">needs re-review</span>}
          </h1>
          <div className="subtitle">
            <SeverityBadge severity={finding.severity} /> <StatusBadge status={finding.status} /> · rule{' '}
            {finding.rule_id} v{finding.rule_version}
          </div>
        </div>
      </div>
      <ProjectTabs projectId={projectId} />

      {finding.stale && (
        <div className="notice-banner">
          A related field or component match was changed since this finding was created. Re-check whether it still
          applies before confirming or dismissing it.
        </div>
      )}

      <div className="card">
        <h2>Explanation</h2>
        <p>{finding.explanation}</p>
      </div>

      <div className="card">
        <h2>Affected documents</h2>
        <ul>
          {finding.affected_document_ids.map((id) => (
            <li key={id}>
              <a onClick={() => navigate(`/projects/${projectId}/documents/${id}`)} style={{ cursor: 'pointer' }}>
                {docsById[id]?.original_filename ?? id}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Evidence</h2>
        {finding.evidence.length === 0 ? (
          <p className="subtitle">No page-level evidence recorded for this finding.</p>
        ) : (
          finding.evidence.map((ev, i) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600 }}>
                {docsById[ev.document_id]?.original_filename ?? ev.document_id}, page {ev.page_number ?? '?'}
              </div>
              {ev.excerpt && <div className="field-meta">“{ev.excerpt}”</div>}
              <button
                className="small"
                style={{ marginTop: 6 }}
                onClick={() => navigate(`/projects/${projectId}/documents/${ev.document_id}`)}
              >
                Open evidence page
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>Reviewer decision</h2>
        <label>Note</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button className="primary" onClick={() => decide('confirmed')}>
            Confirm finding
          </button>
          <button onClick={() => decide('resolved')}>Mark resolved</button>
          <button className="danger" onClick={() => decide('dismissed')}>
            Dismiss
          </button>
        </div>
        {finding.reviewed_at && (
          <p className="field-meta" style={{ marginTop: 10 }}>
            Last reviewed {new Date(finding.reviewed_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}
