import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import ProjectTabs from '../components/ProjectTabs'

export default function ExportScreen() {
  const { projectId } = useParams<{ projectId: string }>()
  const [includeDismissed, setIncludeDismissed] = useState(false)

  if (!projectId) return null

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Export</h1>
          <div className="subtitle">Generate a report for this project's current review state.</div>
        </div>
      </div>
      <ProjectTabs projectId={projectId} />

      <div className="card">
        <h2>PDF report</h2>
        <p className="subtitle">
          A readable report covering document scope, pages processed/failed, checks performed and skipped,
          findings with evidence and reviewer decisions, and unresolved uncertainties.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, textTransform: 'none', fontWeight: 400 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={includeDismissed}
            onChange={(e) => setIncludeDismissed(e.target.checked)}
          />
          Include dismissed findings in the report body
        </label>
        <div style={{ marginTop: 14 }}>
          <a className="btn primary" href={api.exportPdfUrl(projectId, includeDismissed)} target="_blank" rel="noreferrer">
            Download PDF report
          </a>
        </div>
      </div>

      <div className="card">
        <h2>CSV audit export</h2>
        <p className="subtitle">
          A machine-readable export of documents, processing jobs, checks, and the full finding history (including
          dismissed findings, for audit purposes).
        </p>
        <a className="btn primary" href={api.exportCsvUrl(projectId)} target="_blank" rel="noreferrer">
          Download CSV
        </a>
      </div>

      <div className="notice-banner">
        Both exports carry a notice that this report supports human review and does not certify airworthiness,
        authenticate documents, or constitute a regulatory compliance decision.
      </div>
    </div>
  )
}
