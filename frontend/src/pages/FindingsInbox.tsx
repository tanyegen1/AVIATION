import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { SeverityBadge, StatusBadge } from '../components/Badges'
import FindingPanel, { type FindingDecision } from '../components/FindingPanel'
import MatchCompare from '../components/MatchCompare'
import { useShell } from '../shell/AppShell'
import type { ComponentMatch, Document, Finding } from '../types'
import { Icon } from '../ui/Icon'
import { useFeedback } from '../ui/feedback'
import { Button, EmptyState, PageHeader, Skeleton } from '../ui/primitives'

const STATUSES = ['open', 'all', 'confirmed', 'resolved', 'dismissed'] as const
type StatusFilter = (typeof STATUSES)[number]
const SEVERITIES = ['discrepancy', 'needs_review', 'missing_identifier', 'expected_document_missing']
const MATCH_ORDER: Record<string, number> = { suggested: 0, confirmed: 1, rejected: 2 }

function useWide(query = '(min-width: 1001px)') {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return wide
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export default function FindingsInbox() {
  const { projectId, findingId } = useParams<{ projectId: string; findingId?: string }>()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { refreshProject } = useShell()
  const { toast } = useFeedback()
  const wide = useWide()

  const view = params.get('view') === 'matches' ? 'matches' : 'findings'
  const matchId = params.get('match')
  const base = `/projects/${projectId}`

  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [matches, setMatches] = useState<ComponentMatch[] | null>(null)
  const [docsById, setDocsById] = useState<Record<string, Document>>({})
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusFilter>('open')
  const [severity, setSeverity] = useState('')
  const [rerunning, setRerunning] = useState(false)
  const decideFinding = useRef<((d: FindingDecision) => void) | null>(null)
  const decideMatch = useRef<((d: 'confirmed' | 'rejected') => void) | null>(null)

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
    () => (findings ?? []).filter((f) => (status === 'all' || f.status === status) && (!severity || f.severity === severity)),
    [findings, status, severity],
  )

  const orderedMatches = useMemo(
    () => [...(matches ?? [])].sort((a, b) => MATCH_ORDER[a.status] - MATCH_ORDER[b.status]),
    [matches],
  )

  const selected = findings?.find((f) => f.id === findingId)
  const selectedMatch = matches?.find((m) => m.id === matchId)

  // Arriving at a finding outside the current filter (a deep link, or the
  // back button) widens the filter — checked once per finding, so a decision
  // that moves the current finding out of "Open" doesn't flip the filter.
  const checkedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!selected || checkedFor.current === selected.id) return
    checkedFor.current = selected.id
    if (!visible.includes(selected)) {
      setStatus('all')
      setSeverity('')
    }
  }, [selected, visible])

  const openFinding = useCallback(
    (f: Finding | undefined, replace = false) => f && navigate(`${base}/findings/${f.id}`, { replace }),
    [navigate, base],
  )
  const openMatch = useCallback(
    (m: ComponentMatch | undefined, replace = false) =>
      m && navigate(`${base}/findings?view=matches&match=${m.id}`, { replace }),
    [navigate, base],
  )

  // On wide screens the detail pane is never empty: select the first item.
  useEffect(() => {
    if (!wide) return
    if (view === 'findings' && !findingId && visible.length) openFinding(visible[0], true)
    if (view === 'matches' && !matchId && orderedMatches.length) openMatch(orderedMatches[0], true)
  }, [wide, view, findingId, matchId, visible, orderedMatches, openFinding, openMatch])

  function onFindingDecided(updated: Finding, decision: FindingDecision) {
    const idx = visible.findIndex((f) => f.id === updated.id)
    setFindings((all) => (all ?? []).map((f) => (f.id === updated.id ? updated : f)))
    refreshProject()
    if (decision === 'open') return
    // Move on to the next open finding, the way an inbox does.
    const rest = [...visible.slice(idx + 1), ...visible.slice(0, Math.max(0, idx))]
    const next = rest.find((f) => f.status === 'open' && f.id !== updated.id)
    if (next) openFinding(next, true)
  }

  function onMatchDecided(updated: ComponentMatch) {
    setMatches((all) => (all ?? []).map((m) => (m.id === updated.id ? updated : m)))
    refreshProject()
    // Confirming or withdrawing a match re-runs the checks: findings change.
    if (projectId) api.listFindings(projectId).then(setFindings).catch(() => {})
    if (updated.status !== 'suggested') {
      const next = orderedMatches.find((m) => m.status === 'suggested' && m.id !== updated.id)
      if (next) openMatch(next, true)
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

  // Keyboard: J/K move, C/R/D decide a finding, C/X decide a match.
  const keyState = useRef({ view, visible, orderedMatches, findingId, matchId })
  keyState.current = { view, visible, orderedMatches, findingId, matchId }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('.modal-backdrop')) return
      const { view, visible, orderedMatches, findingId, matchId } = keyState.current
      const key = e.key.toLowerCase()
      if (view === 'findings') {
        const idx = visible.findIndex((f) => f.id === findingId)
        if (key === 'j') openFinding(visible[Math.min(visible.length - 1, idx + 1)], true)
        else if (key === 'k') openFinding(visible[Math.max(0, idx - 1)], true)
        else if (key === 'c') decideFinding.current?.('confirmed')
        else if (key === 'r') decideFinding.current?.('resolved')
        else if (key === 'd') decideFinding.current?.('dismissed')
      } else {
        const idx = orderedMatches.findIndex((m) => m.id === matchId)
        if (key === 'j') openMatch(orderedMatches[Math.min(orderedMatches.length - 1, idx + 1)], true)
        else if (key === 'k') openMatch(orderedMatches[Math.max(0, idx - 1)], true)
        else if (key === 'c') decideMatch.current?.('confirmed')
        else if (key === 'x') decideMatch.current?.('rejected')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openFinding, openMatch])

  if (!projectId) return null

  const docName = (id: string) => docsById[id]?.original_filename ?? 'Unknown document'
  const suggestedCount = (matches ?? []).filter((m) => m.status === 'suggested').length
  const openCount = (findings ?? []).filter((f) => f.status === 'open').length
  const hasSelection = view === 'findings' ? !!findingId : !!matchId
  const loading = findings === null && !error

  return (
    <div className="page page-wide">
      <PageHeader
        title="Findings"
        subtitle="Results of the selected automated checks, and the component matches they depend on. Each finding is a prompt for human review — not a compliance decision."
        actions={
          <Button icon="refresh" loading={rerunning} onClick={rerun}>
            Re-run checks
          </Button>
        }
      />

      {error && <div className="error-banner">{error}</div>}

      <div className="tabs" role="tablist">
        <Link to={`${base}/findings`} className={`tab ${view === 'findings' ? 'is-on' : ''}`} role="tab" aria-selected={view === 'findings'}>
          <Icon name="alert" size={15} /> Findings <span className="chip-count">{openCount}</span>
        </Link>
        <Link
          to={`${base}/findings?view=matches`}
          className={`tab ${view === 'matches' ? 'is-on' : ''}`}
          role="tab"
          aria-selected={view === 'matches'}
        >
          <Icon name="link" size={15} /> Component matches
          {suggestedCount > 0 && <span className="chip-count is-warn">{suggestedCount} to confirm</span>}
        </Link>
      </div>

      {loading ? (
        <div className="card card-pad">
          <Skeleton lines={5} />
        </div>
      ) : view === 'findings' && findings!.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="checkCircle"
            title="No findings from the selected checks"
            action={
              suggestedCount > 0 ? (
                <Link to={`${base}/findings?view=matches`} className="btn btn-secondary btn-md">
                  <Icon name="link" size={16} /> Review {suggestedCount} suggested match{suggestedCount === 1 ? '' : 'es'}
                </Link>
              ) : undefined
            }
          >
            This reflects only the checks that have run so far. It is not an airworthiness or compliance statement.
            {suggestedCount > 0 && ' Cross-record checks run only on component matches you have confirmed.'}
          </EmptyState>
        </div>
      ) : view === 'matches' && orderedMatches.length === 0 ? (
        <div className="card">
          <EmptyState icon="link" title="No component matches suggested">
            A match is suggested when two processed documents show the same part number and serial number.
          </EmptyState>
        </div>
      ) : (
        <div className={`inbox ${hasSelection ? 'has-selection' : ''}`}>
          <div className="card inbox-list">
            {view === 'findings' ? (
              <>
                <div className="inbox-filters">
                  <div className="chips">
                    {STATUSES.map((s) => (
                      <button key={s} className={`chip ${status === s ? 'is-on' : ''}`} onClick={() => setStatus(s)}>
                        {s[0].toUpperCase() + s.slice(1)}
                        <span className="chip-count">{counts[s] ?? 0}</span>
                      </button>
                    ))}
                  </div>
                  <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filter by severity">
                    <option value="">All severities</option>
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                {visible.length === 0 ? (
                  <div className="inbox-empty muted">
                    {status === 'open' ? 'No open findings — everything has a reviewer decision.' : 'Nothing matches these filters.'}
                  </div>
                ) : (
                  visible.map((f) => (
                    <Link
                      key={f.id}
                      to={`${base}/findings/${f.id}`}
                      replace={wide}
                      className={`inbox-item sev-${f.severity} ${f.id === findingId ? 'is-active' : ''} ${f.status !== 'open' ? 'is-decided' : ''}`}
                    >
                      <div className="inbox-item-title">
                        {f.title}
                        {f.stale && (
                          <span className="stale-tag">
                            <Icon name="refresh" size={11} /> re-review
                          </span>
                        )}
                      </div>
                      <div className="inbox-item-meta">{f.affected_document_ids.map(docName).join(' · ')}</div>
                      <div className="inbox-item-badges">
                        <SeverityBadge severity={f.severity} />
                        {f.status !== 'open' && <StatusBadge status={f.status} />}
                      </div>
                    </Link>
                  ))
                )}
              </>
            ) : (
              orderedMatches.map((m, i) => (
                <div key={m.id}>
                  {(i === 0 || orderedMatches[i - 1].status !== m.status) && (
                    <div className="field-group-title">
                      {m.status === 'suggested' ? 'To confirm' : m.status === 'confirmed' ? 'Confirmed' : 'Rejected'}
                    </div>
                  )}
                  <Link
                    to={`${base}/findings?view=matches&match=${m.id}`}
                    replace={wide}
                    className={`inbox-item ${m.id === matchId ? 'is-active' : ''} ${m.status !== 'suggested' ? 'is-decided' : ''}`}
                  >
                    <div className="inbox-item-title">
                      {docName(m.document_id_a)}
                      <Icon name="link" size={13} />
                      {docName(m.document_id_b)}
                    </div>
                    <div className="inbox-item-meta mono">
                      P/N {m.part_number ?? '—'} · S/N {m.serial_number ?? '—'}
                    </div>
                  </Link>
                </div>
              ))
            )}
          </div>

          <div className="inbox-detail">
            <button
              className="inbox-back"
              onClick={() => (view === 'findings' ? navigate(`${base}/findings`) : setParams({ view: 'matches' }))}
            >
              <Icon name="chevronLeft" size={14} /> {view === 'findings' ? 'All findings' : 'All matches'}
            </button>
            {view === 'findings' ? (
              selected ? (
                <FindingPanel
                  key={selected.id}
                  projectId={projectId}
                  finding={selected}
                  docsById={docsById}
                  onDecided={onFindingDecided}
                  decideRef={decideFinding}
                />
              ) : findingId ? (
                <div className="card">
                  <EmptyState icon="alertCircle" title="Finding not found">
                    It may have been removed when the checks were re-run.
                  </EmptyState>
                </div>
              ) : (
                <div className="card inbox-placeholder">
                  <EmptyState icon="alert" title="Select a finding">
                    Pick a finding on the left to see its evidence and record a decision.
                  </EmptyState>
                </div>
              )
            ) : selectedMatch ? (
              <MatchCompare
                key={selectedMatch.id}
                projectId={projectId}
                match={selectedMatch}
                docsById={docsById}
                onDecided={onMatchDecided}
                decideRef={decideMatch}
              />
            ) : (
              <div className="card inbox-placeholder">
                <EmptyState icon="link" title="Select a match">
                  Pick a suggested pair on the left to compare the two records side by side.
                </EmptyState>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
