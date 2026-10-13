import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { ComponentMatch, Document, ExtractedField } from '../types'
import { Icon } from '../ui/Icon'
import { useFeedback } from '../ui/feedback'
import { Button, Callout, Skeleton, timeAgo } from '../ui/primitives'
import { MatchBadge } from './Badges'

type Row = { key: string; label: string; identity?: boolean }

// Identity rows get a same/differs marker. Usage and dates are shown side by
// side only: records from different dates are expected to differ there, and
// judging that is the rules engine's job, not this table's.
const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'Identity',
    rows: [
      { key: 'part_number', label: 'Part number', identity: true },
      { key: 'serial_number', label: 'Serial number', identity: true },
      { key: 'component_description', label: 'Description', identity: true },
      { key: 'aircraft_registration', label: 'Aircraft registration', identity: true },
    ],
  },
  {
    title: 'Usage',
    rows: [
      { key: 'flight_hours', label: 'Flight hours' },
      { key: 'flight_cycles', label: 'Flight cycles' },
      { key: 'usage_basis', label: 'Usage basis' },
    ],
  },
  { title: 'Dates', rows: [{ key: 'date', label: 'Dates' }] },
  {
    title: 'Maintenance',
    rows: [
      { key: 'maintenance_action', label: 'Action' },
      { key: 'work_order_reference', label: 'Work order' },
      { key: 'organization', label: 'Organization' },
    ],
  },
]

const norm = (v: string | null) => (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

function compare(a: ExtractedField[], b: ExtractedField[]): 'same' | 'differs' | 'one-side' | null {
  const va = a.map((f) => f.effective_value).filter((v): v is string => !!v)
  const vb = b.map((f) => f.effective_value).filter((v): v is string => !!v)
  if (!va.length && !vb.length) return null
  if (!va.length || !vb.length) return 'one-side'
  return norm(va[0]) === norm(vb[0]) ? 'same' : 'differs'
}

export default function MatchCompare({
  projectId,
  match,
  docsById,
  onDecided,
  decideRef,
}: {
  projectId: string
  match: ComponentMatch
  docsById: Record<string, Document>
  onDecided: (updated: ComponentMatch) => void
  decideRef?: { current: ((d: 'confirmed' | 'rejected') => void) | null }
}) {
  const { toast } = useFeedback()
  const [fields, setFields] = useState<[ExtractedField[], ExtractedField[]] | null>(null)
  const [note, setNote] = useState(match.reviewer_note ?? '')
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    setFields(null)
    setNote(match.reviewer_note ?? '')
    Promise.all([api.listFields(match.document_id_a), api.listFields(match.document_id_b)])
      .then(([a, b]) => setFields([a, b]))
      .catch(() => setFields([[], []]))
  }, [match.id, match.document_id_a, match.document_id_b, match.reviewer_note])

  async function decide(status: 'confirmed' | 'rejected' | 'suggested') {
    if (saving) return
    setSaving(status)
    try {
      const updated = await api.decideMatch(match.id, status, note.trim() || undefined)
      toast(
        'success',
        status === 'confirmed' ? 'Match confirmed' : status === 'rejected' ? 'Match rejected' : 'Decision undone',
        status === 'confirmed'
          ? 'Cross-record checks now run for this pair.'
          : status === 'suggested'
            ? 'The pair is back in review. Findings that relied on it are marked for re-review.'
            : undefined,
      )
      onDecided(updated)
    } catch (e) {
      toast('error', 'Could not save decision', e instanceof ApiError ? e.message : undefined)
    } finally {
      setSaving(null)
    }
  }

  if (decideRef) decideRef.current = (d) => match.status === 'suggested' && decide(d)

  const docs = [docsById[match.document_id_a], docsById[match.document_id_b]]
  const ids = [match.document_id_a, match.document_id_b]
  const byName = (list: ExtractedField[], key: string) => list.filter((f) => f.field_name === key)
  const fieldHref = (docId: string, f: ExtractedField) =>
    `/projects/${projectId}/documents/${docId}?page=${f.page_number ?? 1}&field=${f.id}`

  return (
    <div className="match-compare">
      <div className="finding-panel-head">
        <div className="page-eyebrow">
          <MatchBadge status={match.status} />
          <span>
            Suggested because both records show P/N <code>{match.part_number ?? '—'}</code> and S/N{' '}
            <code>{match.serial_number ?? '—'}</code>
          </span>
        </div>
        <h2>Do these records describe the same component?</h2>
      </div>

      <div className="card compare-card">
        <div className="compare-grid compare-docs">
          <div />
          {ids.map((id, i) => (
            <div key={id} className="compare-doc">
              <span className="compare-doc-tag">{i === 0 ? 'A' : 'B'}</span>
              <div style={{ minWidth: 0 }}>
                <Link to={`/projects/${projectId}/documents/${id}`} className="compare-doc-name">
                  {docs[i]?.original_filename ?? 'Unknown document'}
                </Link>
                <div className="faint">{docs[i]?.document_category.replace(/_/g, ' ') ?? ''}</div>
              </div>
            </div>
          ))}
        </div>

        {!fields ? (
          <div className="card-pad">
            <Skeleton lines={5} />
          </div>
        ) : (
          SECTIONS.map((section) => {
            const rows = section.rows.filter((r) => byName(fields[0], r.key).length || byName(fields[1], r.key).length)
            if (!rows.length) return null
            return (
              <div key={section.title}>
                <div className="field-group-title">{section.title}</div>
                {rows.map((r) => {
                  const sides = [byName(fields[0], r.key), byName(fields[1], r.key)]
                  const verdict = r.identity ? compare(sides[0], sides[1]) : null
                  return (
                    <div key={r.key} className={`compare-grid compare-row ${verdict === 'differs' ? 'is-diff' : ''}`}>
                      <div className="compare-label">
                        {r.label}
                        {verdict === 'same' && (
                          <span className="compare-mark is-same">
                            <Icon name="check" size={11} strokeWidth={3} /> same
                          </span>
                        )}
                        {verdict === 'differs' && <span className="compare-mark is-diff">differs</span>}
                        {verdict === 'one-side' && <span className="compare-mark">one side only</span>}
                      </div>
                      {sides.map((list, i) => (
                        <div key={i} className="compare-cell">
                          {list.length === 0 ? (
                            <span className="faint">—</span>
                          ) : (
                            list.map((f) => (
                              <Link key={f.id} to={fieldHref(ids[i], f)} className="compare-value" title="Open this field on its page">
                                {f.qualifier && <span className="compare-qualifier">{f.qualifier.replace(/_/g, ' ')}</span>}
                                <span className={f.effective_value === null ? 'is-null' : ''}>
                                  {f.effective_value ?? 'not readable'}
                                </span>
                                {f.review_status === 'corrected' && <span className="compare-tag">corrected</span>}
                              </Link>
                            ))
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      <div className="card card-pad decision-card">
        {match.status === 'suggested' ? (
          <>
            <div className="decision-card-head">
              <h3 style={{ margin: 0 }}>Reviewer decision</h3>
            </div>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
              Matches are never confirmed automatically. Confirming lets the cross-record checks (conflicting values,
              decreasing usage) compare these two records.
            </p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional)" aria-label="Reviewer note" />
            <div className="decision-row">
              <Button variant="primary" icon="check" loading={saving === 'confirmed'} disabled={!!saving} onClick={() => decide('confirmed')} title="Same component (C)">
                Confirm match
              </Button>
              <Button icon="x" loading={saving === 'rejected'} disabled={!!saving} onClick={() => decide('rejected')} title="Different components (X)">
                Reject
              </Button>
            </div>
            <div className="decision-help faint kbd-hints">
              <kbd>C</kbd> confirm · <kbd>X</kbd> reject · <kbd>J</kbd> <kbd>K</kbd> move
            </div>
          </>
        ) : (
          <div className="decided-row">
            <div>
              <strong>{match.status === 'confirmed' ? 'Confirmed as the same component' : 'Rejected — different components'}</strong>
              <div className="faint" style={{ fontSize: 12.5 }}>
                {match.reviewed_at && `Decided ${timeAgo(match.reviewed_at)}`}
                {match.reviewer_note && ` · “${match.reviewer_note}”`}
              </div>
            </div>
            <Button icon="refresh" loading={saving === 'suggested'} disabled={!!saving} onClick={() => decide('suggested')}>
              Undo decision
            </Button>
          </div>
        )}
      </div>

      {match.status === 'confirmed' && (
        <Callout tone="info">
          Undoing a confirmed match marks any findings that relied on it for re-review.
        </Callout>
      )}
    </div>
  )
}
