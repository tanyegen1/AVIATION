import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { Document, Finding, FindingEvidence } from '../types'
import { Icon } from '../ui/Icon'
import { useFeedback } from '../ui/feedback'
import { Button, Callout, timeAgo } from '../ui/primitives'
import { SeverityBadge, StatusBadge } from './Badges'

export type FindingDecision = 'confirmed' | 'resolved' | 'dismissed' | 'open'

const DONE_LABEL: Record<FindingDecision, string> = {
  confirmed: 'Finding confirmed',
  resolved: 'Finding marked resolved',
  dismissed: 'Finding dismissed',
  open: 'Finding reopened',
}

/** Detail + decision panel for one finding. `decideRef` lets the parent's
 *  keyboard shortcuts trigger the same decision path as the buttons. */
export default function FindingPanel({
  projectId,
  finding,
  docsById,
  onDecided,
  decideRef,
}: {
  projectId: string
  finding: Finding
  docsById: Record<string, Document>
  onDecided: (updated: Finding, decision: FindingDecision) => void
  decideRef?: { current: ((d: FindingDecision) => void) | null }
}) {
  const { toast } = useFeedback()
  const [note, setNote] = useState(finding.reviewer_note ?? '')
  const [saving, setSaving] = useState<FindingDecision | null>(null)

  useEffect(() => setNote(finding.reviewer_note ?? ''), [finding.id, finding.reviewer_note])

  async function decide(status: FindingDecision) {
    if (saving) return
    setSaving(status)
    try {
      const updated = await api.decideFinding(finding.id, status, note.trim() || undefined)
      toast('success', DONE_LABEL[status], finding.title)
      onDecided(updated, status)
    } catch (e) {
      toast('error', 'Could not save decision', e instanceof ApiError ? e.message : undefined)
    } finally {
      setSaving(null)
    }
  }

  if (decideRef) decideRef.current = decide

  const docName = (id: string) => docsById[id]?.original_filename ?? 'Unknown document'
  const evidenceLink = (ev: FindingEvidence) => {
    const qs = new URLSearchParams()
    if (ev.page_number) qs.set('page', String(ev.page_number))
    if (ev.field_id) qs.set('field', ev.field_id)
    const s = qs.toString()
    return `/projects/${projectId}/documents/${ev.document_id}${s ? `?${s}` : ''}`
  }
  const decided = finding.status !== 'open'

  return (
    <div className="finding-panel">
      <div className="finding-panel-head">
        <div className="page-eyebrow">
          <SeverityBadge severity={finding.severity} />
          <StatusBadge status={finding.status} />
          {finding.stale && (
            <span className="stale-tag">
              <Icon name="refresh" size={11} /> needs re-review
            </span>
          )}
        </div>
        <h2>{finding.title}</h2>
      </div>

      {finding.stale && (
        <Callout tone="warning" title="Something this finding relied on has changed">
          A cited field was corrected, or a related component match was decided or withdrawn, after this finding was
          created. Check whether it still applies before deciding.
        </Callout>
      )}

      <div className="card card-pad">
        <h3 style={{ marginTop: 0 }}>What the check found</h3>
        <p style={{ margin: 0, lineHeight: 1.6 }}>{finding.explanation}</p>
      </div>

      <div className="card card-pad decision-card">
        <div className="decision-card-head">
          <h3 style={{ margin: 0 }}>Reviewer decision</h3>
          {finding.reviewed_at && <span className="faint">Last decided {timeAgo(finding.reviewed_at)}</span>}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Note (optional) — why you confirmed, resolved, or dismissed this finding"
          aria-label="Reviewer note"
        />
        <div className="decision-row">
          <Button
            variant="primary"
            icon="alertCircle"
            loading={saving === 'confirmed'}
            disabled={saving !== null || finding.status === 'confirmed'}
            onClick={() => decide('confirmed')}
            title="The discrepancy is real and needs follow-up (C)"
          >
            Confirm
          </Button>
          <Button
            icon="checkCircle"
            loading={saving === 'resolved'}
            disabled={saving !== null || finding.status === 'resolved'}
            onClick={() => decide('resolved')}
            title="It was real and has been addressed (R)"
          >
            Resolved
          </Button>
          <Button
            variant="ghost"
            icon="x"
            loading={saving === 'dismissed'}
            disabled={saving !== null || finding.status === 'dismissed'}
            onClick={() => decide('dismissed')}
            title="Not a real issue (D)"
          >
            Dismiss
          </Button>
          {decided && (
            <Button variant="ghost" icon="refresh" loading={saving === 'open'} disabled={saving !== null} onClick={() => decide('open')}>
              Reopen
            </Button>
          )}
        </div>
        <div className="decision-help faint">
          Confirm = real and needs follow-up · Resolved = real and addressed · Dismiss = not a real issue
          <span className="kbd-hints">
            <kbd>C</kbd> <kbd>R</kbd> <kbd>D</kbd> decide · <kbd>J</kbd> <kbd>K</kbd> move between findings
          </span>
        </div>
      </div>

      <div className="section-title">
        <h2>Evidence</h2>
        <span className="muted">
          {finding.evidence.length} item{finding.evidence.length === 1 ? '' : 's'}
        </span>
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

      <div className="finding-panel-foot faint">
        {finding.affected_document_ids.length} document{finding.affected_document_ids.length === 1 ? '' : 's'}:{' '}
        {finding.affected_document_ids.map((id, i) => (
          <span key={id}>
            {i > 0 && ', '}
            <Link to={`/projects/${projectId}/documents/${id}`}>{docName(id)}</Link>
          </span>
        ))}
        {' '}· rule {finding.rule_id} v{finding.rule_version} · created {timeAgo(finding.created_at)}
      </div>
    </div>
  )
}
