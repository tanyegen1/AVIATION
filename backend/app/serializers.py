"""ORM -> plain-dict serialization helpers shared across routers."""
from __future__ import annotations

import json

from app.models import ComponentMatch, Document, ExtractedField, Finding, Project, ProcessingJob


def project_out(p: Project, document_count: int = 0) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "require_maintenance_release_for_status_sheets": p.require_maintenance_release_for_status_sheets,
        "created_at": p.created_at.isoformat(),
        "document_count": document_count,
    }


def document_out(d: Document) -> dict:
    return {
        "id": d.id,
        "project_id": d.project_id,
        "original_filename": d.original_filename,
        "storage_filename": d.storage_filename,
        "sha256": d.sha256,
        "size_bytes": d.size_bytes,
        "page_count": d.page_count,
        "document_category": d.document_category,
        "category_source": d.category_source,
        "is_scanned": d.is_scanned,
        "status": d.status,
        "duplicate_of_document_id": d.duplicate_of_document_id,
        "error_message": d.error_message,
        "uploaded_at": d.uploaded_at.isoformat(),
    }


def job_out(j: ProcessingJob) -> dict:
    return {
        "id": j.id,
        "document_id": j.document_id,
        "mode": j.mode,
        "page_start": j.page_start,
        "page_end": j.page_end,
        "status": j.status,
        "pages_processed": j.pages_processed,
        "pages_failed": j.pages_failed,
        "failed_pages": json.loads(j.failed_pages_json) if j.failed_pages_json else [],
        "retries_used": j.retries_used,
        "cancel_requested": j.cancel_requested,
        "model_id": j.model_id,
        "input_tokens": j.input_tokens,
        "output_tokens": j.output_tokens,
        "duration_ms": j.duration_ms,
        "error_message": j.error_message,
        "created_at": j.created_at.isoformat(),
        "started_at": j.started_at.isoformat() if j.started_at else None,
        "finished_at": j.finished_at.isoformat() if j.finished_at else None,
    }


def field_out(f: ExtractedField) -> dict:
    return {
        "id": f.id,
        "run_id": f.run_id,
        "document_id": f.document_id,
        "field_name": f.field_name,
        "qualifier": f.qualifier,
        "raw_value": f.raw_value,
        "normalized_value": f.normalized_value,
        "effective_value": f.effective_value(),
        "page_number": f.page_number,
        "evidence_text": f.evidence_text,
        "evidence_verification": f.evidence_verification,
        "self_reported_confidence": f.self_reported_confidence,
        "review_status": f.review_status,
        "corrected_value": f.corrected_value,
        "corrected_at": f.corrected_at.isoformat() if f.corrected_at else None,
        "corrected_note": f.corrected_note,
        "needs_rereview": f.needs_rereview,
    }


def match_out(m: ComponentMatch) -> dict:
    return {
        "id": m.id,
        "project_id": m.project_id,
        "document_id_a": m.document_id_a,
        "document_id_b": m.document_id_b,
        "match_basis": m.match_basis,
        "part_number": m.part_number,
        "serial_number": m.serial_number,
        "status": m.status,
        "reviewed_at": m.reviewed_at.isoformat() if m.reviewed_at else None,
        "reviewer_note": m.reviewer_note,
        "created_at": m.created_at.isoformat(),
    }


def finding_out(f: Finding) -> dict:
    return {
        "id": f.id,
        "project_id": f.project_id,
        "rule_id": f.rule_id,
        "rule_version": f.rule_version,
        "severity": f.severity,
        "title": f.title,
        "explanation": f.explanation,
        "affected_document_ids": json.loads(f.affected_document_ids_json),
        "affected_field_ids": json.loads(f.affected_field_ids_json),
        "evidence": json.loads(f.evidence_json),
        "status": f.status,
        "stale": f.stale,
        "reviewer_note": f.reviewer_note,
        "reviewed_at": f.reviewed_at.isoformat() if f.reviewed_at else None,
        "created_at": f.created_at.isoformat(),
        "updated_at": f.updated_at.isoformat(),
    }
