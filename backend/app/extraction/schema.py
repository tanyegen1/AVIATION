"""Structured extraction schema shared by every provider.

Every provider (demo or live) must return data validated against
`ExtractionResult`. Field-level nulls are expected and meaningful: a
field that could not be read is `None`, never a guessed value (spec
section 6). `self_reported_confidence` is the model's own label and is
never presented to a reviewer as a measured probability.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

DocumentCategory = Literal[
    "component_status_sheet",
    "maintenance_release_record",
    "unknown_type",
]

Confidence = Literal["low", "medium", "high"]

# Canonical field names. "date" may appear multiple times with distinct
# qualifiers (e.g. "manufacture_date", "release_date", "next_due_date").
FieldName = Literal[
    "aircraft_registration",
    "part_number",
    "serial_number",
    "component_description",
    "date",
    "flight_hours",
    "flight_cycles",
    "usage_basis",
    "maintenance_action",
    "work_order_reference",
    "organization",
]

UsageBasis = Literal["since_new", "since_overhaul", "unspecified"]


class ExtractedFieldOut(BaseModel):
    field_name: FieldName
    qualifier: str | None = Field(
        default=None,
        description="For field_name='date', what this date means, e.g. 'manufacture_date', "
        "'release_date', 'next_due_date', 'installation_date'. Null for other fields.",
    )
    raw_value: str | None = Field(
        default=None, description="Exact value as it appears on the page. Null if unreadable or absent."
    )
    normalized_value: str | None = Field(
        default=None,
        description="Normalized form only if unambiguous (e.g. date to YYYY-MM-DD). "
        "Null if normalization would be ambiguous or raw_value is null.",
    )
    page_number: int | None = Field(default=None, description="1-based page number this value was read from.")
    evidence_text: str | None = Field(
        default=None, description="Short verbatim excerpt from the page supporting this value."
    )
    self_reported_confidence: Confidence | None = None


class PageExtractionResult(BaseModel):
    """Extraction output for a single page, as returned by the AI provider."""

    document_category_guess: DocumentCategory
    category_confidence: Confidence
    page_is_scanned_image: bool = Field(
        description="True if this page appeared to be a scanned image rather than digital text."
    )
    fields: list[ExtractedFieldOut] = Field(default_factory=list)
    notes: str | None = Field(
        default=None, description="Optional short note, e.g. why the page could not be classified."
    )


CANONICAL_FIELD_ORDER = list(FieldName.__args__)  # type: ignore[attr-defined]
