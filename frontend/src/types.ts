export type DocumentCategory = 'component_status_sheet' | 'maintenance_release_record' | 'unknown_type'
export type CategorySource = 'manual' | 'ai_suggested' | 'unclassified'
export type DocumentStatus = 'uploaded' | 'queued' | 'processing' | 'processed' | 'failed' | 'duplicate'
export type JobMode = 'demo' | 'live'
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type ReviewStatus = 'unreviewed' | 'confirmed' | 'corrected' | 'flagged_unreadable'
export type MatchStatus = 'suggested' | 'confirmed' | 'rejected'
export type FindingStatus = 'open' | 'confirmed' | 'dismissed' | 'resolved'
export type FindingSeverity = 'discrepancy' | 'needs_review' | 'missing_identifier' | 'expected_document_missing'

export interface Project {
  id: string
  name: string
  description: string | null
  require_maintenance_release_for_status_sheets: boolean
  created_at: string
  document_count: number
}

export interface Document {
  id: string
  project_id: string
  original_filename: string
  storage_filename: string
  sha256: string
  size_bytes: number
  page_count: number | null
  document_category: DocumentCategory
  category_source: CategorySource
  is_scanned: boolean | null
  status: DocumentStatus
  duplicate_of_document_id: string | null
  error_message: string | null
  uploaded_at: string
  latest_job?: ProcessingJob | null
  review?: { total: number; reviewed: number }
}

export interface FailedPage {
  page: number
  reason: string
}

export interface ProcessingJob {
  id: string
  document_id: string
  mode: JobMode
  page_start: number
  page_end: number
  status: JobStatus
  pages_processed: number
  pages_failed: number
  failed_pages: FailedPage[]
  retries_used: number
  cancel_requested: boolean
  model_id: string | null
  input_tokens: number | null
  output_tokens: number | null
  duration_ms: number | null
  error_message: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface ExtractedField {
  id: string
  run_id: string
  document_id: string
  field_name: string
  qualifier: string | null
  raw_value: string | null
  normalized_value: string | null
  effective_value: string | null
  page_number: number | null
  evidence_text: string | null
  evidence_verification: 'text_verified' | 'text_mismatch' | 'requires_visual_verification' | 'unverified' | 'no_evidence'
  self_reported_confidence: 'low' | 'medium' | 'high' | null
  review_status: ReviewStatus
  corrected_value: string | null
  corrected_at: string | null
  corrected_note: string | null
  needs_rereview: boolean
}

export interface ComponentMatch {
  id: string
  project_id: string
  document_id_a: string
  document_id_b: string
  match_basis: string
  part_number: string | null
  serial_number: string | null
  status: MatchStatus
  reviewed_at: string | null
  reviewer_note: string | null
  created_at: string
}

export interface FindingEvidence {
  document_id: string
  field_id?: string
  page_number: number | null
  excerpt: string | null
}

export interface Finding {
  id: string
  project_id: string
  rule_id: string
  rule_version: string
  severity: FindingSeverity
  title: string
  explanation: string
  affected_document_ids: string[]
  affected_field_ids: string[]
  evidence: FindingEvidence[]
  status: FindingStatus
  stale: boolean
  reviewer_note: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface ApiStatus {
  demo_mode_available: boolean
  live_mode_available: boolean
  live_model: string | null
  auth_enabled: boolean
}

export interface ProjectSummary {
  documents: { total: number; processed: number; failed: number; active: number; duplicate: number; unprocessed: number }
  fields: { total: number; reviewed: number }
  findings: { total: number; open: number; stale: number; open_by_severity: Record<string, number> }
  matches: { suggested: number; confirmed: number; rejected: number }
}
