export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    uploaded: '',
    queued: 'info',
    processing: 'info',
    processed: 'success',
    failed: 'danger',
    duplicate: 'warning',
    completed: 'success',
    cancelled: 'warning',
    running: 'info',
    open: 'warning',
    confirmed: 'danger',
    dismissed: '',
    resolved: 'success',
    unreviewed: '',
    corrected: 'info',
    flagged_unreadable: 'warning',
    suggested: 'info',
    rejected: '',
  }
  return <span className={`badge ${tone[status] ?? ''}`}>{status.replace(/_/g, ' ')}</span>
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tone: Record<string, string> = {
    discrepancy: 'danger',
    needs_review: 'warning',
    missing_identifier: 'warning',
    expected_document_missing: 'info',
  }
  return <span className={`badge ${tone[severity] ?? ''}`}>{severity.replace(/_/g, ' ')}</span>
}

export function EvidenceBadge({ verification }: { verification: string }) {
  const tone: Record<string, string> = {
    text_verified: 'success',
    text_mismatch: 'danger',
    requires_visual_verification: 'warning',
    unverified: '',
    no_evidence: '',
  }
  const labels: Record<string, string> = {
    text_verified: 'Text verified',
    text_mismatch: 'Text mismatch',
    requires_visual_verification: 'Needs visual check',
    unverified: 'Unverified',
    no_evidence: 'No evidence cited',
  }
  return <span className={`badge ${tone[verification] ?? ''}`}>{labels[verification] ?? verification}</span>
}

// Field review status: unlike findings, a confirmed field is a good outcome.
export function ReviewBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    unreviewed: '',
    confirmed: 'success',
    corrected: 'info',
    flagged_unreadable: 'warning',
  }
  return <span className={`badge ${tone[status] ?? ''}`}>{status.replace(/_/g, ' ')}</span>
}

// Component match status: a confirmed pairing is a neutral-to-good outcome.
export function MatchBadge({ status }: { status: string }) {
  const tone: Record<string, string> = { suggested: 'info', confirmed: 'success', rejected: '' }
  return <span className={`badge ${tone[status] ?? ''}`}>{status}</span>
}
