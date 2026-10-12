import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { SeverityBadge, StatusBadge } from '../components/Badges'
import { useShell } from '../shell/AppShell'
import type { Document, Finding, FindingEvidence } from '../types'
import { Icon } from '../ui/Icon'
import { useFeedback } from '../ui/feedback'
import { Button, Callout, PageHeader, Skeleton, timeAgo } from '../ui/primitives'

type Decision = 'confirmed' | 'resolved' | 'dismissed'

export default function FindingDetail() {
  const { projectId, findingId } = useParams<{ projectId: string; findingId: string }>()
  const { refreshProject } = useShell()
  const { toast } = useFeedback()
  const [finding, setFinding] = useState<Finding | null>(null)
  const [docsById, setDocsById] = useState<Record<string, Document>>({})
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<Decision | null>(null)

  const load = useCallback(() => {
    if (!findingId || !projectId) return
    Promise.all([api.getFinding(findingId), api.listDocuments(projectId)])
      .then(([f, docs]) => {
        setFinding(f)
        setNote(f.reviewer_note ?? '')
        setDocsById(Object.fromEntries(docs.map((d) => [d.id, d])))
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load finding.'))
  }, [findingId, projectId])

  useEffect(load, [load])

  async function decide(status: Decision) {
    if (!findingId) return
    setSaving(status)
    try {
      await api.decideFinding(findingId, status, note.trim() || undefined)
      toast('success', `Finding ${status}`, note.trim() ? 'Your note was saved with the decision.' : undefined)
      refreshProject()
      load()
    } catch (e) {
      toast('error', 'Could not save decision', e instanceof ApiError ? e.message : undefined)
    } finally {
      setSaving(null)
    }
  }

  if (error) {
    return (
      <div className="page">
        <div className="error-banner">{error}</div>
      </div>
    )
  }
  if (!finding || !projectId) {
    return (
      <div className="page">
        <Skeleton lines={6} />
      </div>
    )
  }

  const docName = (id: string) => docsById[id]?.original_filename ?? 'Unknown document'
  const evidenceLink = (ev: FindingEvidence) => {
    const qs = new URLSearchParams()
    if (ev.page_number) qs.set('page', String(ev.page_number))
    if (ev.field_id) qs.set('field', ev.field_id)
    const s = qs.toString()
    return `/projects/${projectId}/documents/${ev.document_id}${s ? `?${s}` : ''}`
  }

  return (
    <div className="page">
      <Link to={`/projects/${projectId}/findings`} className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 10, fontSize: 13 }}>
        <Icon name="chevronLeft" size={14} /> All findings
      </Link>
      <PageHeader
        eyebrow={
          <>
            <SeverityBadge severity={finding.severity} />
            <StatusBadge status={finding.status} />
            {finding.stale && (
              <span className="stale-tag">
                <Icon name="refresh" size={11} /> needs re-review
              </span>
            )}
          </>
        }
        title={finding.title}
      />

      {finding.stale && (
        <Callout tone="warning" title="Something this finding relied on has changed">
          A cited field was corrected or a related component match was decided after this finding was created. Check
          whether it still applies before deciding.
        </Callout>
      )}

      <div className="detail-layout">
        <div>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>What the check found</h3>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{finding.explanation}</p>
          </div>

          <div className="section-title">
            <h2>Evidence</h2>
            <span className="muted">{finding.evidence.length} item{finding.evidence.length === 1 ? '' : 's'}</span>
          </div>
          <div className="card">
            {finding.evidence.length === 0 ? (
              <div className="card-pad muted">No page-level evidence was recorded for this finding.</div>
            ) : (
              finding.evidence.map((ev, i) => (
                <div key={i} className="evidence-item">
                  <div className="doc-icon">
                    <Icon name="file" />
                  </div>
                  <div className="evidence-item-main">
                    <div className="evidence-doc">{docName(ev.document_id)}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {ev.page_number ? `Page ${ev.page_number}` : 'Page not recorded'}
                    </div>
                    {ev.excerpt && <div className="evidence-quote">“{ev.excerpt}”</div>}
                  </div>
                  <Link to={evidenceLink(ev)} className="btn btn-secondary btn-sm">
                    <Icon name="eye" size={14} /> Open page
                  </Link>
                </div>
              ))
            )}
          </div>

          <div className="section-title">
            <h2>Affected documents</h2>
          </div>
          <div className="card">
            <ul className="doc-list">
              {finding.affected_document_ids.map((id) => (
                <li key={id} className="doc-item" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                  <div className="doc-main">
                    <div className="doc-icon">
                      <Icon name="file" />
                    </div>
                    <Link to={`/projects/${projectId}/documents/${id}`} className="doc-name">
                      {docName(id)}
                    </Link>
                  </div>
                  {docsById[id] && <StatusBadge status={docsById[id].status} />}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>Reviewer decision</h3>
            <label className="field-label" htmlFor="note">
              Note <span className="faint">(optional)</span>
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Why you confirmed, resolved, or dismissed this finding"
            />
            <div className="decision-buttons">
              <Button
                variant="primary"
                icon="alertCircle"
                loading={saving === 'confirmed'}
                disabled={saving !== null}
                onClick={() => decide('confirmed')}
              >
                Confirm finding
              </Button>
              <Button icon="checkCircle" loading={saving === 'resolved'} disabled={saving !== null} onClick={() => decide('resolved')}>
                Mark resolved
              </Button>
              <Button variant="ghost" icon="x" loading={saving === 'dismissed'} disabled={saving !== null} onClick={() => decide('dismissed')}>
                Dismiss
              </Button>
            </div>
            <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
              Confirm = the discrepancy is real and needs follow-up. Resolved = it was real and has been addressed.
              Dismiss = not a real issue.
            </p>
          </div>

          <div className="card card-pad" style={{ marginTop: 16 }}>
            <dl className="kv" style={{ margin: 0 }}>
              <dt>Rule</dt>
              <dd>
                {finding.rule_id} v{finding.rule_version}
              </dd>
              <dt>Created</dt>
              <dd>{timeAgo(finding.created_at)}</dd>
              <dt>Last reviewed</dt>
              <dd>{finding.reviewed_at ? timeAgo(finding.reviewed_at) : 'Not yet'}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
