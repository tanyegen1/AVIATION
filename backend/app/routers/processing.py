from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import MAX_PAGES_PER_JOB, live_mode_available
from app.current_fields import current_fields
from app.db import SessionLocal, get_db
from app.jobs import run_job
from app.models import ComponentMatch, Document, ExtractedField, Finding, ProcessingJob
from app.routers.documents import _get_document_or_404
from app.rules.engine import run_rules_for_project
from app.schemas import FieldCorrection, FieldFlagUnreadable, FindingDecision, JobCreate, MatchDecision
from app.serializers import field_out, finding_out, job_out, match_out

router = APIRouter(tags=["processing"])


def _run_job_in_background(job_id: str) -> None:
    db = SessionLocal()
    try:
        run_job(job_id, db)
    finally:
        db.close()


@router.post("/api/documents/{document_id}/jobs")
def create_job(document_id: str, body: JobCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    document = _get_document_or_404(db, document_id)

    if body.mode == "live" and not live_mode_available():
        raise HTTPException(
            status_code=400,
            detail="Live processing requires ANTHROPIC_API_KEY to be configured on the server.",
        )

    if document.status == "processed" and not body.force:
        raise HTTPException(
            status_code=409,
            detail="This document was already processed. Pass force=true to reprocess.",
        )

    if document.status == "duplicate":
        raise HTTPException(status_code=400, detail="This document is a duplicate of another upload and cannot be processed.")

    active_job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.document_id == document_id, ProcessingJob.status.in_(["queued", "running"]))
        .first()
    )
    if active_job:
        raise HTTPException(status_code=409, detail="A processing job is already running for this document.")

    page_count = document.page_count or body.page_end
    page_start = max(1, body.page_start)
    page_end = min(body.page_end, page_count)
    if page_start > page_end:
        raise HTTPException(status_code=400, detail="Invalid page range.")
    if page_end - page_start + 1 > MAX_PAGES_PER_JOB:
        raise HTTPException(
            status_code=400,
            detail=f"A single job can process at most {MAX_PAGES_PER_JOB} pages. Narrow the page range.",
        )

    job = ProcessingJob(document_id=document_id, mode=body.mode, page_start=page_start, page_end=page_end, status="queued")
    db.add(job)
    document.status = "queued"
    document.error_message = None
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_job_in_background, job.id)
    return job_out(job)


@router.get("/api/documents/{document_id}/jobs")
def list_jobs(document_id: str, db: Session = Depends(get_db)):
    _get_document_or_404(db, document_id)
    jobs = db.query(ProcessingJob).filter(ProcessingJob.document_id == document_id).order_by(ProcessingJob.created_at.desc()).all()
    return [job_out(j) for j in jobs]


def _get_job_or_404(db: Session, job_id: str) -> ProcessingJob:
    job = db.get(ProcessingJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@router.get("/api/jobs/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db)):
    return job_out(_get_job_or_404(db, job_id))


@router.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str, db: Session = Depends(get_db)):
    job = _get_job_or_404(db, job_id)
    if job.status not in ("queued", "running"):
        raise HTTPException(status_code=400, detail="Only a queued or running job can be cancelled.")
    job.cancel_requested = True
    db.commit()
    return job_out(job)


@router.get("/api/documents/{document_id}/fields")
def list_fields(document_id: str, db: Session = Depends(get_db)):
    _get_document_or_404(db, document_id)
    fields = sorted(current_fields(db, document_id), key=lambda f: (f.page_number or 0, f.field_name))
    return [field_out(f) for f in fields]


def _get_field_or_404(db: Session, field_id: str) -> ExtractedField:
    f = db.get(ExtractedField, field_id)
    if f is None:
        raise HTTPException(status_code=404, detail="Field not found.")
    return f


def _rerun_rules_and_flag_findings(db: Session, document_id: str, field_id: str) -> None:
    """A field correction invalidates any open/confirmed finding that cited it -
    mark those as needing re-review rather than silently keeping the old
    conclusion, then recompute the rule set (spec section 8)."""
    document = db.get(Document, document_id)
    affected = (
        db.query(Finding)
        .filter(Finding.project_id == document.project_id, Finding.status.in_(["open", "confirmed"]))
        .all()
    )
    for finding in affected:
        if field_id in json.loads(finding.affected_field_ids_json):
            finding.stale = True
    db.commit()
    run_rules_for_project(db, document.project_id)


@router.patch("/api/fields/{field_id}/correct")
def correct_field(field_id: str, body: FieldCorrection, db: Session = Depends(get_db)):
    f = _get_field_or_404(db, field_id)
    f.corrected_value = body.corrected_value
    f.corrected_note = body.corrected_note
    f.corrected_at = datetime.utcnow()
    f.review_status = "corrected"
    db.commit()
    _rerun_rules_and_flag_findings(db, f.document_id, f.id)
    db.refresh(f)
    return field_out(f)


@router.patch("/api/fields/{field_id}/confirm")
def confirm_field(field_id: str, db: Session = Depends(get_db)):
    f = _get_field_or_404(db, field_id)
    f.review_status = "confirmed"
    db.commit()
    db.refresh(f)
    return field_out(f)


@router.patch("/api/fields/{field_id}/flag-unreadable")
def flag_field_unreadable(field_id: str, body: FieldFlagUnreadable, db: Session = Depends(get_db)):
    f = _get_field_or_404(db, field_id)
    f.review_status = "flagged_unreadable"
    f.corrected_note = body.corrected_note
    f.corrected_at = datetime.utcnow()
    db.commit()
    _rerun_rules_and_flag_findings(db, f.document_id, f.id)
    db.refresh(f)
    return field_out(f)


@router.get("/api/projects/{project_id}/matches")
def list_matches(project_id: str, db: Session = Depends(get_db)):
    matches = db.query(ComponentMatch).filter(ComponentMatch.project_id == project_id).order_by(ComponentMatch.created_at.desc()).all()
    return [match_out(m) for m in matches]


@router.patch("/api/matches/{match_id}")
def decide_match(match_id: str, body: MatchDecision, db: Session = Depends(get_db)):
    m = db.get(ComponentMatch, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Match not found.")
    m.status = body.status
    m.reviewer_note = body.reviewer_note
    m.reviewed_at = datetime.utcnow()
    db.commit()
    run_rules_for_project(db, m.project_id)
    db.refresh(m)
    return match_out(m)


@router.get("/api/projects/{project_id}/findings")
def list_findings(
    project_id: str,
    status: str | None = None,
    severity: str | None = None,
    rule_id: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Finding).filter(Finding.project_id == project_id)
    if status:
        q = q.filter(Finding.status == status)
    if severity:
        q = q.filter(Finding.severity == severity)
    if rule_id:
        q = q.filter(Finding.rule_id == rule_id)
    findings = q.order_by(Finding.created_at.desc()).all()
    return [finding_out(f) for f in findings]


@router.get("/api/findings/{finding_id}")
def get_finding(finding_id: str, db: Session = Depends(get_db)):
    f = db.get(Finding, finding_id)
    if f is None:
        raise HTTPException(status_code=404, detail="Finding not found.")
    return finding_out(f)


@router.patch("/api/findings/{finding_id}")
def decide_finding(finding_id: str, body: FindingDecision, db: Session = Depends(get_db)):
    f = db.get(Finding, finding_id)
    if f is None:
        raise HTTPException(status_code=404, detail="Finding not found.")
    f.status = body.status
    f.reviewer_note = body.reviewer_note
    f.reviewed_at = datetime.utcnow()
    f.stale = False
    db.commit()
    db.refresh(f)
    return finding_out(f)


@router.post("/api/projects/{project_id}/rules/run")
def rerun_rules(project_id: str, db: Session = Depends(get_db)):
    rule_run = run_rules_for_project(db, project_id)
    return {
        "id": rule_run.id,
        "rule_ids_executed": json.loads(rule_run.rule_ids_executed_json),
        "rule_ids_skipped": json.loads(rule_run.rule_ids_skipped_json),
        "findings_created": rule_run.findings_created,
        "created_at": rule_run.created_at.isoformat(),
    }
