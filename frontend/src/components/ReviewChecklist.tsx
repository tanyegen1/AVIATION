import { Link } from 'react-router-dom'
import type { Document, ProjectSummary } from '../types'
import { Icon, type IconName } from '../ui/Icon'
import { Progress } from '../ui/primitives'

type StepState = 'done' | 'current' | 'todo' | 'waiting'

interface Step {
  key: string
  icon: IconName
  title: string
  detail: string
  note?: string
  done: boolean
  waiting?: boolean
  attention?: boolean
  progress?: number
  cta: { label: string; to: string }
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

function buildSteps(projectId: string, s: ProjectSummary, documents: Document[] | null): Step[] {
  const base = `/projects/${projectId}`
  const d = s.documents
  const processable = d.total - d.duplicate
  const nextToReview = documents?.find((doc) => doc.review && doc.review.reviewed < doc.review.total)
  const m = s.matches
  const f = s.findings

  return [
    {
      key: 'upload',
      icon: 'upload',
      title: 'Upload documents',
      detail: d.total
        ? `${plural(d.total, 'document')} uploaded${d.duplicate ? ` (${d.duplicate} duplicate)` : ''}.`
        : 'Add component status sheets or maintenance/release records (PDF).',
      done: d.total > 0,
      cta: { label: d.total ? 'Add more' : 'Upload documents', to: `${base}/documents` },
    },
    {
      key: 'process',
      icon: 'play',
      title: 'Extract fields',
      detail:
        d.active > 0
          ? `${plural(d.active, 'document')} processing now…`
          : `${d.processed} of ${processable} processed${d.unprocessed ? ` · ${d.unprocessed} not started` : ''}.`,
      note: d.failed ? `${plural(d.failed, 'document')} failed — retry or remove ${d.failed === 1 ? 'it' : 'them'}.` : undefined,
      attention: d.failed > 0,
      done: processable > 0 && d.unprocessed === 0 && d.active === 0 && d.failed === 0,
      waiting: d.total === 0,
      progress: processable ? d.processed / processable : undefined,
      cta: { label: 'Go to documents', to: `${base}/documents` },
    },
    {
      key: 'fields',
      icon: 'checkCircle',
      title: 'Review extracted fields',
      detail: s.fields.total
        ? `${s.fields.reviewed} of ${plural(s.fields.total, 'field')} confirmed, corrected or flagged.`
        : 'Fields appear here once documents are processed.',
      done: s.fields.total > 0 && s.fields.reviewed === s.fields.total,
      waiting: s.fields.total === 0,
      progress: s.fields.total ? s.fields.reviewed / s.fields.total : undefined,
      cta: {
        label: nextToReview ? 'Continue reviewing' : 'Open documents',
        to: nextToReview ? `${base}/documents/${nextToReview.id}` : `${base}/documents`,
      },
    },
    {
      key: 'matches',
      icon: 'link',
      title: 'Confirm component matches',
      detail:
        m.suggested > 0
          ? `${plural(m.suggested, 'suggested pair')} to confirm or reject.`
          : m.confirmed + m.rejected > 0
            ? `${m.confirmed} confirmed · ${m.rejected} rejected.`
            : 'None suggested. A match is suggested when two records show the same part and serial number.',
      done: d.processed > 0 && m.suggested === 0,
      waiting: d.processed === 0,
      cta: { label: 'Compare records', to: `${base}/findings?view=matches` },
    },
    {
      key: 'findings',
      icon: 'alert',
      title: 'Decide findings',
      detail:
        f.open > 0
          ? `${plural(f.open, 'open finding')}${f.stale ? ` · ${f.stale} need re-review` : ''}.`
          : f.stale > 0
            ? `${plural(f.stale, 'finding')} need re-review.`
            : f.total > 0
              ? `All ${plural(f.total, 'finding')} have a reviewer decision.`
              : 'No findings from the selected checks so far.',
      note: m.suggested > 0 ? 'Cross-record checks run only on matches you have confirmed.' : undefined,
      attention: f.stale > 0,
      done: d.processed > 0 && f.open === 0 && f.stale === 0,
      waiting: d.processed === 0,
      cta: { label: 'Open findings', to: `${base}/findings` },
    },
    {
      key: 'export',
      icon: 'download',
      title: 'Export the report',
      detail:
        'A PDF report and CSV audit trail of the current review state. Open items are listed as unresolved.',
      done: false,
      waiting: d.processed === 0,
      cta: { label: 'Preview report', to: `${base}/export` },
    },
  ]
}

export default function ReviewChecklist({
  projectId,
  summary,
  documents,
}: {
  projectId: string
  summary: ProjectSummary
  documents: Document[] | null
}) {
  const steps = buildSteps(projectId, summary, documents)
  const currentIdx = steps.findIndex((s) => !s.done && !s.waiting)
  const state = (s: Step, i: number): StepState =>
    s.done ? 'done' : i === currentIdx ? 'current' : s.waiting ? 'waiting' : 'todo'
  const current = steps[currentIdx]
  const reviewDone = steps.slice(0, 5).every((s) => s.done)

  return (
    <>
      {current && (
        <div className={`card next-step ${current.attention ? 'is-attention' : ''}`}>
          <div className="next-step-icon">
            <Icon name={current.icon} size={22} />
          </div>
          <div className="next-step-body">
            <div className="next-step-eyebrow">
              {reviewDone ? 'Review complete' : `Next step · ${currentIdx + 1} of ${steps.length}`}
            </div>
            <h2>{reviewDone ? 'Ready to export' : current.title}</h2>
            <p>
              {reviewDone
                ? 'Every extracted field, suggested match and finding has a reviewer decision.'
                : (current.note ?? current.detail)}
            </p>
          </div>
          <Link to={current.cta.to} className="btn btn-primary btn-md">
            {current.cta.label} <Icon name="chevronRight" size={16} />
          </Link>
        </div>
      )}

      <ol className="card checklist">
        {steps.map((s, i) => {
          const st = state(s, i)
          return (
            <li key={s.key} className={`checklist-step is-${st} ${s.attention && !s.done ? 'is-attention' : ''}`}>
              <div className="checklist-marker" aria-hidden="true">
                {st === 'done' ? <Icon name="check" size={14} strokeWidth={3} /> : i + 1}
              </div>
              <div className="checklist-body">
                <div className="checklist-title">
                  {s.title}
                  <span className="sr-only">
                    {st === 'done' ? ' (done)' : st === 'current' ? ' (next)' : st === 'waiting' ? ' (waiting on earlier steps)' : ''}
                  </span>
                </div>
                <div className="checklist-detail">{s.detail}</div>
                {s.note && <div className="checklist-note">{s.note}</div>}
                {s.progress !== undefined && !s.done && (
                  <div className="checklist-progress">
                    <Progress value={s.progress} tone="success" />
                  </div>
                )}
              </div>
              {st !== 'waiting' && (
                <Link to={s.cta.to} className={`btn btn-sm ${st === 'current' ? 'btn-primary' : 'btn-secondary'}`}>
                  {s.cta.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}
