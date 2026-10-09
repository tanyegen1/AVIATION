import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { ComponentMatch, Document, Finding } from '../types'
import ProjectTabs from '../components/ProjectTabs'
import { SeverityBadge, StatusBadge } from '../components/Badges'

export default function FindingsList() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [matches, setMatches] = useState<ComponentMatch[]>([])
  const [docsById, setDocsById] = useState<Record<string, Document>>({})
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [rerunning, setRerunning] = useState(false)

  function load() {
    if (!projectId) return
    api
      .listFindings(projectId, { status: statusFilter || undefined, severity: severityFilter || undefined })
      .then(setFindings)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load findings.'))
    api.listMatches(projectId).then(setMatches)
    api.listDocuments(projectId).then((docs) => {
      setDocsById(Object.fromEntries(docs.map((d) => [d.id, d])))
    })
  }

  useEffect(load, [projectId, statusFilter, severityFilter])

  async function decideMatch(id: string, status: 'confirmed' | 'rejected') {
    if (!projectId) return
    await api.decideMatch(id, status)
    load()
  }

  async function rerun() {
    if (!projectId) return
    setRerunning(true)
    try {
      await api.rerunRules(projectId)
      load()
    } finally {
      setRerunning(false)
    }
  }

  if (!projectId) return null

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Findings</h1>
          <div className="subtitle">
            Automated checks against the rules engine. Every finding requires human confirmation — this is not a
            compliance decision.
          </div>
        </div>
        <button onClick={rerun} disabled={rerunning}>
          {rerunning ? 'Re-running checks…' : 'Re-run checks'}
        </button>
      </div>
      <ProjectTabs projectId={projectId} />

      {error && <div className="error-banner">{error}</div>}

      {matches.filter((m) => m.status === 'suggested').length > 0 && (
        <div className="card">
          <h2>Suggested component matches</h2>
          <p className="subtitle">
            These document pairs share the same part number and serial number. Confirm the pairing before
            cross-record checks (conflicting values, decreasing usage) run against them.
          </p>
          {matches
            .filter((m) => m.status === 'suggested')
            .map((m) => (
              <div key={m.id} className="doc-row" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {docsById[m.document_id_a]?.original_filename ?? m.document_id_a} ↔{' '}
                    {docsById[m.document_id_b]?.original_filename ?? m.document_id_b}
                  </div>
                  <div className="field-meta">
                    part {m.part_number} / serial {m.serial_number}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="small primary" onClick={() => decideMatch(m.id, 'confirmed')}>
                    Confirm match
                  </button>
                  <button className="small danger" onClick={() => decideMatch(m.id, 'rejected')}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      <div className="filters-bar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="confirmed">Confirmed</option>
          <option value="dismissed">Dismissed</option>
          <option value="resolved">Resolved</option>
        </select>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="">All severities</option>
          <option value="discrepancy">Discrepancy</option>
          <option value="needs_review">Needs review</option>
          <option value="missing_identifier">Missing identifier</option>
          <option value="expected_document_missing">Expected document missing</option>
        </select>
      </div>

      {findings === null && !error && <div className="loading-state">Loading…</div>}

      {findings && findings.length === 0 && (
        <div className="empty-state card">
          <div className="icon">✓</div>
          <p>
            <strong>No findings from the selected checks.</strong>
          </p>
          <p className="subtitle">This reflects the checks that have run so far — it is not an airworthiness or compliance statement.</p>
        </div>
      )}

      {findings && findings.length > 0 && (
        <div>
          {findings.map((f) => (
            <div key={f.id} className={`card finding-card ${f.severity}`} onClick={() => navigate(`/projects/${projectId}/findings/${f.id}`)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>
                  {f.title}
                  {f.stale && <span className="stale-tag">needs re-review</span>}
                </h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <SeverityBadge severity={f.severity} />
                  <StatusBadge status={f.status} />
                </div>
              </div>
              <p style={{ marginBottom: 4 }}>{f.explanation}</p>
              <div className="field-meta">rule: {f.rule_id} · {f.affected_document_ids.length} document(s) affected</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
