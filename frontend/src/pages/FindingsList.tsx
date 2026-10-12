import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { SeverityBadge, StatusBadge } from '../components/Badges'
import { useShell } from '../shell/AppShell'
import type { ComponentMatch, Document, Finding } from '../types'
import { Icon } from '../ui/Icon'
import { useFeedback } from '../ui/feedback'
import { Button, EmptyState, PageHeader, Skeleton } from '../ui/primitives'

const STATUSES = ['all', 'open', 'confirmed', 'resolved', 'dismissed'] as const
const SEVERITIES = ['discrepancy', 'needs_review', 'missing_identifier', 'expected_document_missing']

export default function FindingsList() {
  const { projectId } = useParams<{ projectId: string }>()
  const { refreshProject } = useShell()
  const { toast } = useFeedback()
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [matches, setMatches] = useState<ComponentMatch[]>([])
  const [docsById, setDocsById] = useState<Record<string, Document>>({})
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all')
  const [severity, setSeverity] = useState('')
  const [rerunning, setRerunning] = useState(false)
  const [deciding, setDeciding] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!projectId) return
    Promise.all([api.listFindings(projectId), api.listMatches(projectId), api.listDocuments(projectId)])
      .then(([f, m, d]) => {
        setFindings(f)
        setMatches(m)
        setDocsById(Object.fromEntries(d.map((doc) => [doc.id, doc])))
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load findings.'))
  }, [projectId])

  useEffect(load, [load])

  async function decideMatch(m: ComponentMatch, decision: 'confirmed' | 'rejected') {
    setDeciding(m.id)
    try {
      await api.decideMatch(m.id, decision)
      toast(
        'success',
        decision === 'confirmed' ? 'Match confirmed' : 'Match rejected',
        decision === 'confirmed' ? 'Cross-record checks now run for this pair.' : undefined,
      )
      refreshProject()
      load()
    } catch (e) {
      toast('error', 'Could not save decision', e instanceof ApiError ? e.message : undefined)
    } finally {
      setDeciding(null)
    }
  }

  async function rerun() {
    if (!projectId) return
    setRerunning(true)
    try {
      const run = await api.rerunRules(projectId)
      toast(
        'success',
        'Checks re-run',
        `${run.rule_ids_executed.length} checks ran${run.rule_ids_skipped.length ? `, ${run.rule_ids_skipped.length} skipped` : ''} · ${run.findings_created} new finding${run.findings_created === 1 ? '' : 's'}.`,
      )
      refreshProject()
      load()
    } catch (e) {
      toast('error', 'Could not re-run checks', e instanceof ApiError ? e.message : undefined)
    } finally {
      setRerunning(false)
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 }
    for (const f of findings ?? []) {
      if (severity && f.severity !== severity) continue
      c.all += 1
      c[f.status] = (c[f.status] ?? 0) + 1
    }
    return c
  }, [findings, severity])

  const visible = useMemo(
    () =>
      (findings ?? []).filter(
        (f) => (status === 'all' || f.status === status) && (!severity || f.severity === severity),
      ),
    [findings, status, severity],
  )

  const suggested = matches.filter((m) => m.status === 'suggested')
  const docName = (id: string) => docsById[id]?.original_filename ?? 'Unknown document'

  if (!projectId) return null

  return (
    <div className="page">
      <PageHeader
        title="Findings"
        subtitle="Results of the selected automated checks. Each finding is a prompt for human review — not a compliance decision."
        actions={
          <Button icon="refresh" loading={rerunning} onClick={rerun}>
            Re-run checks
          </Button>
        }
      />

      {error && <div className="error-banner">{error}</div>}

      {suggested.length > 0 && (
        <>
          <div className="section-title">
            <h2>Suggested component matches</h2>
            <span className="muted">{suggested.length} to confirm</span>
          </div>
          <p className="muted" style={{ marginTop: -4, fontSize: 13.5 }}>
            These document pairs share the same part number and serial number. Confirm a pairing before cross-record
            checks (conflicting values, decreasing usage) run against it.
          </p>
          <div className="card">
            {suggested.map((m) => (
              <div key={m.id} className="match-row">
                <div style={{ minWidth: 0 }}>
                  <div className="match-docs">
                    <Link to={`/projects/${projectId}/documents/${m.document_id_a}`}>{docName(m.document_id_a)}</Link>
                    <Icon name="link" size={14} />
                    <Link to={`/projects/${projectId}/documents/${m.document_id_b}`}>{docName(m.document_id_b)}</Link>
                  </div>
                  <div className="match-meta">
                    P/N {m.part_number ?? '—'} · S/N {m.serial_number ?? '—'}
                  </div>
                </div>
                <div className="match-actions">
                  <Button
                    size="sm"
                    variant="primary"
                    icon="check"
                    disabled={deciding === m.id}
                    onClick={() => decideMatch(m, 'confirmed')}
                  >
                    Confirm match
                  </Button>
                  <Button size="sm" icon="x" disabled={deciding === m.id} onClick={() => decideMatch(m, 'rejected')}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">
        <h2>Checks</h2>
      </div>
      <div className="toolbar">
        <div className="chips">
          {STATUSES.map((s) => (
            <button key={s} className={`chip ${status === s ? 'is-on' : ''}`} onClick={() => setStatus(s)}>
              {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
              <span className="chip-count">{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          style={{ width: 'auto', minWidth: 190 }}
          aria-label="Filter by severity"
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {findings === null && !error && (
        <div className="card card-pad">
          <Skeleton lines={4} />
        </div>
      )}

      {findings && visible.length === 0 && (
        <div className="card">
          {findings.length === 0 ? (
            <EmptyState icon="checkCircle" title="No findings from the selected checks">
              This reflects only the checks that have run so far. It is not an airworthiness or compliance statement.
            </EmptyState>
          ) : (
            <EmptyState icon="search" title="Nothing matches these filters">
              Try another status or severity.
            </EmptyState>
          )}
        </div>
      )}

      {visible.length > 0 && (
        <div className="card">
          {visible.map((f) => (
            <Link key={f.id} to={`/projects/${projectId}/findings/${f.id}`} className={`finding-row sev-${f.severity}`}>
              <div className="finding-row-main">
                <div className="finding-row-title">
                  {f.title}
                  {f.stale && (
                    <span className="stale-tag">
                      <Icon name="refresh" size={11} /> needs re-review
                    </span>
                  )}
                </div>
                <div className="finding-row-text">{f.explanation}</div>
                <div className="finding-row-meta">
                  {f.affected_document_ids.map(docName).join(' · ')} · rule {f.rule_id}
                </div>
              </div>
              <div className="finding-row-side">
                <SeverityBadge severity={f.severity} />
                <StatusBadge status={f.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
