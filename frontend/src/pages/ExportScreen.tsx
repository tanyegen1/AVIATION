import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { useShell } from '../shell/AppShell'
import { Icon } from '../ui/Icon'
import { Callout, PageHeader } from '../ui/primitives'

export default function ExportScreen() {
  const { projectId } = useParams<{ projectId: string }>()
  const { summary } = useShell()
  const [includeDismissed, setIncludeDismissed] = useState(false)

  if (!projectId) return null

  const unreviewed = summary ? summary.fields.total - summary.fields.reviewed : 0

  return (
    <div className="page">
      <PageHeader title="Export" subtitle="Generate a report of this project's current review state." />

      {summary && (summary.findings.open > 0 || summary.matches.suggested > 0 || unreviewed > 0) && (
        <Callout tone="info" title="Review still in progress">
          {[
            summary.findings.open > 0 && `${summary.findings.open} open finding${summary.findings.open === 1 ? '' : 's'}`,
            summary.matches.suggested > 0 && `${summary.matches.suggested} unconfirmed match${summary.matches.suggested === 1 ? '' : 'es'}`,
            unreviewed > 0 && `${unreviewed} unreviewed field${unreviewed === 1 ? '' : 's'}`,
          ]
            .filter(Boolean)
            .join(' · ')}
          . You can still export — the report lists these as unresolved.
        </Callout>
      )}

      <div className="export-grid">
        <div className="card card-pad export-card">
          <div className="export-card-icon">
            <Icon name="file" size={20} />
          </div>
          <h2>PDF report</h2>
          <p>
            A readable report: document scope, pages processed and failed, checks performed and skipped, findings with
            evidence and reviewer decisions, and unresolved uncertainties.
          </p>
          <label className="check-row">
            <input type="checkbox" checked={includeDismissed} onChange={(e) => setIncludeDismissed(e.target.checked)} />
            <span>Include dismissed findings in the report body</span>
          </label>
          <a className="btn btn-primary btn-md" href={api.exportPdfUrl(projectId, includeDismissed)} target="_blank" rel="noreferrer">
            <Icon name="download" size={16} /> Download PDF
          </a>
        </div>

        <div className="card card-pad export-card">
          <div className="export-card-icon">
            <Icon name="layers" size={20} />
          </div>
          <h2>CSV audit export</h2>
          <p>
            Machine-readable export of documents, processing jobs, checks, and the full finding history — including
            dismissed findings, for audit purposes.
          </p>
          <a className="btn btn-secondary btn-md" href={api.exportCsvUrl(projectId)} target="_blank" rel="noreferrer">
            <Icon name="download" size={16} /> Download CSV
          </a>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <Callout tone="info" icon="info">
          Both exports state that the report supports human review and does not certify airworthiness, authenticate
          documents, or constitute a regulatory compliance decision.
        </Callout>
      </div>
    </div>
  )
}
