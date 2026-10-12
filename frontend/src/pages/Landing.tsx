import { Link } from 'react-router-dom'

const FEATURES = [
  {
    title: 'Structured extraction',
    body: 'Upload component status sheets and maintenance/release records. The system pulls out part numbers, serials, dates, usage, and more — every value tied to the page and excerpt it came from.',
  },
  {
    title: 'Evidence you can check',
    body: 'Every extracted field links back to its source page. Nothing is accepted on faith — a reviewer opens the exact evidence before trusting a value.',
  },
  {
    title: 'Discrepancy detection',
    body: 'A small, explicit rules engine flags missing identifiers, conflicting values, and usage inconsistencies across matched records — never an open-ended AI judgment call.',
  },
  {
    title: 'Human review, always',
    body: 'Component matches are suggested, never auto-confirmed. Every finding is a prompt for a qualified reviewer, not a verdict.',
  },
]

export default function Landing() {
  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden="true" />

      <header className="landing-nav">
        <div className="landing-brand">RecordBridge</div>
        <Link to="/login" className="btn primary">
          Enter workspace
        </Link>
      </header>

      <main className="landing-hero">
        <span className="landing-eyebrow">Aviation technical records, reviewed faster</span>
        <h1>
          Bridge the gap between
          <br />
          raw documents and reviewed records.
        </h1>
        <p className="landing-sub">
          RecordBridge is an AI-assisted workspace for technical-records specialists. Upload maintenance PDFs,
          get structured fields with evidence, and let a human reviewer confirm every discrepancy — not the AI.
        </p>
        <div className="landing-cta">
          <Link to="/login" className="btn primary large">
            Enter workspace →
          </Link>
        </div>
        <p className="landing-disclaimer">
          RecordBridge supports human review. It does not certify airworthiness, authenticate documents, or
          issue regulatory compliance decisions.
        </p>
      </main>

      <section className="landing-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="landing-feature-card">
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="landing-flow">
        <h2>How it works</h2>
        <ol>
          <li>
            <span className="step-number">1</span>
            <div>
              <strong>Create a project</strong> and upload component status sheets or maintenance/release
              records as PDFs.
            </div>
          </li>
          <li>
            <span className="step-number">2</span>
            <div>
              <strong>Process documents</strong> page by page — structured fields come back with their evidence
              and page reference, nothing fabricated.
            </div>
          </li>
          <li>
            <span className="step-number">3</span>
            <div>
              <strong>Review findings</strong> — confirm or reject suggested component matches, correct fields,
              and decide on each flagged discrepancy.
            </div>
          </li>
          <li>
            <span className="step-number">4</span>
            <div>
              <strong>Export a report</strong> covering scope, checks performed, findings, and unresolved
              uncertainties.
            </div>
          </li>
        </ol>
      </section>

      <footer className="landing-footer">
        <span>RecordBridge — a reviewer's workspace, not a certifying authority.</span>
      </footer>
    </div>
  )
}
