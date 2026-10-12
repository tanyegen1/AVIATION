"""Shared helpers for the rules engine: pulling effective field values per document."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.current_fields import current_fields
from app.models import Document, ExtractedField


@dataclass
class FieldRef:
    field_id: str
    value: str | None
    page_number: int | None
    evidence_text: str | None


def primary_field(session: Session, document_id: str, field_name: str) -> FieldRef | None:
    """Earliest-page, non-null effective value for a field on a document."""
    rows = _current_named(session, document_id, field_name)
    for row in rows:
        value = row.effective_value()
        if value is not None and value.strip() != "":
            return FieldRef(field_id=row.id, value=value.strip(), page_number=row.page_number, evidence_text=row.evidence_text)
    return None


def _current_named(session: Session, document_id: str, field_name: str) -> list[ExtractedField]:
    rows = [f for f in current_fields(session, document_id) if f.field_name == field_name]
    return sorted(rows, key=lambda f: (f.page_number is None, f.page_number or 0))


def all_date_fields(session: Session, document_id: str) -> list[ExtractedField]:
    return _current_named(session, document_id, "date")


def representative_document_date(session: Session, document_id: str) -> tuple[date, FieldRef] | None:
    """A best-effort single date to establish chronology between documents.

    Picks the first date field with a value that parses as an unambiguous
    ISO (YYYY-MM-DD) date, preferring the normalized value. Returns None if
    no such date exists - callers must treat that as "chronology unclear".
    """
    for row in all_date_fields(session, document_id):
        value = row.effective_value()
        if not value:
            continue
        parsed = _parse_iso_date(value)
        if parsed is not None:
            return parsed, FieldRef(
                field_id=row.id, value=value, page_number=row.page_number, evidence_text=row.evidence_text
            )
    return None


def _parse_iso_date(value: str) -> date | None:
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d").date()
    except (ValueError, AttributeError):
        return None


def parse_number(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value.strip().replace(",", ""))
    except (ValueError, AttributeError):
        return None


def processed_documents(session: Session, project_id: str) -> list[Document]:
    return (
        session.query(Document)
        .filter(Document.project_id == project_id, Document.status == "processed")
        .all()
    )
