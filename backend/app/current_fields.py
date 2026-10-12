"""Which extracted fields are "current" for a document.

Every processing run adds a new ExtractionRun with its own fields, and old
runs are kept as history (never deleted or overwritten). For any given page,
the current fields are the ones from the most recent run that actually
processed that page successfully. So reprocessing pages 1-2 of a 5-page
document replaces pages 1-2 and leaves pages 3-5 as they were, and a run
that failed or was cancelled before reaching a page doesn't hide the older
fields for it.
"""
from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models import Document, ExtractedField, ExtractionRun


def _covered_pages(run: ExtractionRun) -> set[int]:
    job = run.job
    if job is None:
        return set()
    attempted = job.pages_processed + job.pages_failed
    if job.status == "completed":
        last = job.page_end
    else:  # pages are attempted in order, so a partial run covers a prefix
        last = min(job.page_end, job.page_start + attempted - 1)
    failed = {fp.get("page") for fp in json.loads(job.failed_pages_json or "[]")}
    return {p for p in range(job.page_start, last + 1) if p not in failed}


def current_fields(session: Session, document_id: str) -> list[ExtractedField]:
    runs = (
        session.query(ExtractionRun)
        .filter(ExtractionRun.document_id == document_id)
        .order_by(ExtractionRun.created_at.desc())
        .all()
    )
    owner: dict[int, str] = {}
    for run in runs:  # newest first: the first run to cover a page owns it
        for page in _covered_pages(run):
            owner.setdefault(page, run.id)
    if not owner:
        return []
    rows = (
        session.query(ExtractedField)
        .filter(ExtractedField.document_id == document_id, ExtractedField.run_id.in_(set(owner.values())))
        .all()
    )
    return [f for f in rows if owner.get(f.page_number) == f.run_id]


def current_fields_for_project(session: Session, project_id: str) -> list[ExtractedField]:
    out: list[ExtractedField] = []
    for (doc_id,) in session.query(Document.id).filter(Document.project_id == project_id).all():
        out.extend(current_fields(session, doc_id))
    return out
