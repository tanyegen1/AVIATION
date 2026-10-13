import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import PdfViewer from '../components/PdfViewer'
import { useShell } from '../shell/AppShell'
import { Icon, type IconName } from '../ui/Icon'
import { Button, Callout, PageHeader, Skeleton } from '../ui/primitives'

interface ReadinessItem {
  icon: IconName
  label: [string, string]
  count: number
  to: string
  tone: 'warn' | 'danger'
}

export default function ExportScreen() {
  const { projectId } = useParams<{ projectId: string }>()
  const { summary } = useShell()
  const [includeDismissed, setIncludeDismissed] = useState(false)
  const [page, setPage] = useState(1)
  // Bumped to re-generate the preview after review changes elsewhere.
  const [version, setVersion] = useState(0)

  if (!projectId) return null
  const base = `/projects/${projectId}`

  const items: ReadinessItem[] = summary
    ? [
        { icon: 'play', label: ['document not processed yet', 'documents not processed yet'], count: summary.documents.unprocessed + summary.documents.active, to: `${base}/documents`, tone: 'warn' },
        { icon: 'x', label: ['document failed to process', 'documents failed to process'], count: summary.documents.failed, to: `${base}/documents`, tone: 'danger' },
        { icon: 'checkCircle', label: ['field not reviewed', 'fields not reviewed'], count: summary.fields.total - summary.fields.reviewed, to: `${base}/documents`, tone: 'warn' },
        { icon: 'link', label: ['component match to confirm', 'component matches to confirm'], count: summary.matches.suggested, to: `${base}/findings?view=matches`, tone: 'warn' },
        { icon: 'alert', label: ['open finding', 'open findings'], count: summary.findings.open, to: `${base}/findings`, tone: 'warn' },
        { icon: 'refresh', label: ['finding needs re-review', 'findings need re-review'], count: summary.findings.stale, to: `${base}/findings`, tone: 'danger' },
      ].filter((i): i is ReadinessItem => i.count > 0)
    : []

  const pdfUrl = `${api.exportPdfUrl(projectId, includeDismissed)}&v=${version}`

  return (
    <div className="page page-wide">
      <PageHeader
        title="Export"
        subtitle="Preview and download a report of this project's current review state."
      />

      <div className="export-layout">
        <div className="export-side">
          <div className="card card-pad">
            <h3 className="export-side-title">Before you export</h3>
            {!summary ? (
              <Skeleton lines={3} />
            ) : items.length === 0 ? (
              <div className="readiness-clear">
                <Icon name="checkCircle" size={18} />
                <span>Nothing outstanding — every field, match and finding has a reviewer decision.</span>
              </div>
            ) : (
              <>
                <ul className="readiness-list">
                  {items.map((i) => (
                    <li key={i.label[1]}>
                      <Link to={i.to} className={`readiness-item is-${i.tone}`}>
                        <Icon name={i.icon} size={15} />
                        <span>
                          <strong>{i.count}</strong> {i.label[i.count === 1 ? 0 : 1]}
                        </span>
                        <Icon name="chevronRight" size={14} />
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="faint" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
                  You can still export now — the report lists these as unresolved.
                </p>
              </>
            )}
          </div>

          <div className="card card-pad">
            <h3 className="export-side-title">PDF report</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Document scope, pages processed and failed, checks performed and skipped, findings with evidence and
              reviewer decisions, and unresolved uncertainties.
            </p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={includeDismissed}
                onChange={(e) => {
                  setIncludeDismissed(e.target.checked)
                  setPage(1)
                }}
              />
              <span>Include dismissed findings in the report body</span>
            </label>
            <a className="btn btn-primary btn-md export-download" href={api.exportPdfUrl(projectId, includeDismissed)} download>
              <Icon name="download" size={16} /> Download PDF
            </a>
          </div>

          <div className="card card-pad">
            <h3 className="export-side-title">CSV audit export</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Machine-readable: documents, processing jobs, checks, and the full finding history — including dismissed
              findings.
            </p>
            <a className="btn btn-secondary btn-md export-download" href={api.exportCsvUrl(projectId)} download>
              <Icon name="download" size={16} /> Download CSV
            </a>
          </div>

          <Callout tone="info" icon="info">
            Both exports state that the report supports human review and does not certify airworthiness, authenticate
            documents, or constitute a regulatory compliance decision.
          </Callout>
        </div>

        <div className="export-preview">
          <div className="export-preview-head">
            <div>
              <strong>Report preview</strong>
              <span className="faint"> · exactly what “Download PDF” produces</span>
            </div>
            <Button size="sm" icon="refresh" onClick={() => setVersion((v) => v + 1)}>
              Refresh
            </Button>
          </div>
          <PdfViewer key={pdfUrl} fileUrl={pdfUrl} page={page} onPage={setPage} />
        </div>
      </div>
    </div>
  )
}
