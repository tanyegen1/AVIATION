"""Document processing job execution.

Runs synchronously inside a FastAPI BackgroundTask - this is a local,
single-user evaluation app (spec section 2), so a full queue/worker
system would be over-engineering. Progress, cancellation, and retries
are all tracked in SQLite so the job's state survives across requests.
"""
from __future__ import annotations

import json
import time
from datetime import datetime

from sqlalchemy.orm import Session

from app.config import JOB_MAX_RETRIES, MAX_PAGES_PER_BATCH
from app.extraction import ExtractionError, UnsupportedInDemoMode, get_provider
from app.extraction.schema import PageExtractionResult
from app.models import Document, ExtractedField, ExtractionRun, ProcessingJob
from app.pdf_utils import extract_single_page_pdf_bytes, page_is_scanned, page_text
from app.rules.engine import run_rules_for_project
from app.storage import document_path


def _normalize_for_match(text: str) -> str:
    return " ".join(text.split()).lower()


def _evidence_verification(document_bytes: bytes, page_number: int, evidence_text: str | None) -> str:
    if page_is_scanned(document_bytes, page_number):
        return "requires_visual_verification"
    if not evidence_text:
        return "no_evidence"
    page_plain = _normalize_for_match(page_text(document_bytes, page_number))
    if _normalize_for_match(evidence_text) in page_plain:
        return "text_verified"
    return "text_mismatch"


def _persist_page_result(
    db: Session, run: ExtractionRun, document: Document, document_bytes: bytes, page_number: int, result: PageExtractionResult
) -> None:
    if result.document_category_guess != "unknown_type" and document.category_source == "unclassified":
        document.document_category = result.document_category_guess
        document.category_source = "ai_suggested"
    if result.page_is_scanned_image and document.is_scanned is not True:
        document.is_scanned = True
    elif document.is_scanned is None:
        document.is_scanned = False

    for f in result.fields:
        verification = _evidence_verification(document_bytes, page_number, f.evidence_text)
        db.add(
            ExtractedField(
                run_id=run.id,
                document_id=document.id,
                field_name=f.field_name,
                qualifier=f.qualifier,
                raw_value=f.raw_value,
                normalized_value=f.normalized_value,
                page_number=f.page_number or page_number,
                evidence_text=f.evidence_text,
                evidence_verification=verification,
                self_reported_confidence=f.self_reported_confidence,
            )
        )


def run_job(job_id: str, db: Session) -> None:
    job = db.get(ProcessingJob, job_id)
    if job is None:
        return
    document = db.get(Document, job.document_id)
    if document is None:
        return

    job.status = "running"
    job.started_at = datetime.utcnow()
    document.status = "processing"
    db.commit()

    path = document_path(document.project_id, document.storage_filename)
    document_bytes = path.read_bytes()
    provider = get_provider(job.mode)

    run = ExtractionRun(
        document_id=document.id,
        job_id=job.id,
        extraction_version="1.0.0",
        mode=job.mode,
        model_id=getattr(provider, "model_id", None) if job.mode == "live" else "demo-simulated",
    )
    db.add(run)
    db.flush()

    failed_pages: list[dict] = []
    total_input_tokens = 0
    total_output_tokens = 0
    start_time = time.monotonic()
    aborted_reason: str | None = None

    served_models: set[str] = set()
    pages = list(range(job.page_start, job.page_end + 1))
    for batch_start in range(0, len(pages), MAX_PAGES_PER_BATCH):
        batch = pages[batch_start : batch_start + MAX_PAGES_PER_BATCH]
        for page_number in batch:
            db.refresh(job)
            if job.cancel_requested:
                job.status = "cancelled"
                aborted_reason = "Cancelled by user request."
                break

            single_page_pdf = extract_single_page_pdf_bytes(document_bytes, page_number)
            attempt = 0
            while True:
                try:
                    page_result = provider.extract_page(
                        document_sha256=document.sha256,
                        single_page_pdf_bytes=single_page_pdf,
                        page_number=page_number,
                    )
                    _persist_page_result(db, run, document, document_bytes, page_number, page_result.extraction)
                    if page_result.input_tokens:
                        total_input_tokens += page_result.input_tokens
                    if page_result.output_tokens:
                        total_output_tokens += page_result.output_tokens
                    job.pages_processed += 1
                    job.retries_used += attempt
                    if page_result.model_id:
                        served_models.add(page_result.model_id)
                    break
                except UnsupportedInDemoMode as exc:
                    aborted_reason = str(exc)
                    break
                except ExtractionError as exc:
                    attempt += 1
                    if attempt > JOB_MAX_RETRIES:
                        failed_pages.append({"page": page_number, "reason": str(exc)})
                        job.pages_failed += 1
                        job.retries_used += attempt - 1
                        break
                    continue
            db.commit()
            if aborted_reason:
                break
        if aborted_reason or job.cancel_requested:
            break

    job.failed_pages_json = json.dumps(failed_pages)
    job.finished_at = datetime.utcnow()
    job.duration_ms = int((time.monotonic() - start_time) * 1000)
    # Record the model(s) that actually answered (a refusal fallback can
    # substitute another model for some pages).
    job.model_id = ", ".join(sorted(served_models)) if served_models else run.model_id
    job.input_tokens = total_input_tokens or None
    job.output_tokens = total_output_tokens or None

    if job.status == "cancelled":
        document.status = "processed" if job.pages_processed > 0 else "failed"
        if job.pages_processed == 0:
            document.error_message = "Cancelled before any page was successfully processed."
    elif job.pages_processed == 0:
        # Nothing succeeded - whether due to an abort (e.g. unsupported in demo mode)
        # or every page exhausting its retries - this must never look like a clean
        # successful review (spec section 5/10).
        job.status = "failed"
        job.error_message = aborted_reason or "All pages failed to process."
        document.status = "failed"
        document.error_message = job.error_message
    else:
        job.status = "completed"
        document.status = "processed"
        if aborted_reason:
            job.error_message = aborted_reason
        elif job.pages_failed:
            job.error_message = f"{job.pages_failed} page(s) failed to process; see failed_pages for details."

    db.commit()

    if document.status == "processed":
        run_rules_for_project(db, document.project_id)
