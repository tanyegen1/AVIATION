"""Explicit, hand-written discrepancy checks (spec section 7).

No check here asks an LLM for a compliance judgment - every rule is
plain Python comparing already-extracted, reviewer-correctable field
values. Each check returns a list of `FindingDraft` objects; the engine
is responsible for deduplication, persistence, and staleness tracking.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models import ComponentMatch, Document
from app.rules.helpers import parse_number, primary_field, representative_document_date

REQUIRED_FIELDS_BY_CATEGORY: dict[str, list[str]] = {
    "component_status_sheet": ["part_number", "serial_number", "aircraft_registration"],
    "maintenance_release_record": ["part_number", "serial_number", "work_order_reference"],
}

# Fields compared for cross-record consistency once two documents are a
# CONFIRMED component match. part_number/serial_number are excluded because
# they are the match basis and are equal by construction.
IDENTITY_CONSISTENCY_FIELDS = ["aircraft_registration", "component_description"]


@dataclass
class FindingDraft:
    rule_id: str
    rule_version: str
    severity: str
    title: str
    explanation: str
    affected_document_ids: list[str]
    affected_field_ids: list[str]
    evidence: list[dict] = field(default_factory=list)
    dedup_key: str = ""


def check_required_identifiers(session: Session, documents: list[Document]) -> list[FindingDraft]:
    """Rule: required identifiers missing or unreadable, per an explicit per-category template."""
    drafts: list[FindingDraft] = []
    for doc in documents:
        required = REQUIRED_FIELDS_BY_CATEGORY.get(doc.document_category)
        if not required:
            continue  # no template for unknown_type - nothing to check
        missing: list[str] = []
        field_ids: list[str] = []
        evidence: list[dict] = []
        for field_name in required:
            ref = primary_field(session, doc.id, field_name)
            if ref is None:
                missing.append(field_name)
            else:
                field_ids.append(ref.field_id)
        if missing:
            drafts.append(
                FindingDraft(
                    rule_id="required_identifiers_missing",
                    rule_version="1.0.0",
                    severity="missing_identifier",
                    title=f"Missing required identifiers ({doc.original_filename})",
                    explanation=(
                        f"The review template for '{doc.document_category}' requires "
                        f"{', '.join(required)}. The following were missing or unreadable: "
                        f"{', '.join(missing)}."
                    ),
                    affected_document_ids=[doc.id],
                    affected_field_ids=field_ids,
                    evidence=evidence,
                    dedup_key=f"required_identifiers_missing|{doc.id}|{','.join(sorted(missing))}",
                )
            )
    return drafts


def check_conflicting_identity_values(
    session: Session, confirmed_matches: list[ComponentMatch]
) -> list[FindingDraft]:
    """Rule: conflicting values across records CONFIRMED to be the same component."""
    drafts: list[FindingDraft] = []
    for match in confirmed_matches:
        for field_name in IDENTITY_CONSISTENCY_FIELDS:
            ref_a = primary_field(session, match.document_id_a, field_name)
            ref_b = primary_field(session, match.document_id_b, field_name)
            if ref_a is None or ref_b is None:
                continue
            if ref_a.value.strip().lower() != ref_b.value.strip().lower():
                drafts.append(
                    FindingDraft(
                        rule_id="conflicting_identity_values",
                        rule_version="1.0.0",
                        severity="discrepancy",
                        title=f"Conflicting {field_name.replace('_', ' ')} across matched records",
                        explanation=(
                            f"Documents confirmed to describe the same component report different "
                            f"values for {field_name.replace('_', ' ')}: "
                            f"'{ref_a.value}' vs '{ref_b.value}'."
                        ),
                        affected_document_ids=[match.document_id_a, match.document_id_b],
                        affected_field_ids=[ref_a.field_id, ref_b.field_id],
                        evidence=[
                            {"document_id": match.document_id_a, "page_number": ref_a.page_number, "excerpt": ref_a.evidence_text},
                            {"document_id": match.document_id_b, "page_number": ref_b.page_number, "excerpt": ref_b.evidence_text},
                        ],
                        dedup_key=f"conflicting_identity_values|{match.id}|{field_name}",
                    )
                )
    return drafts


def _check_decreasing_usage(
    session: Session, confirmed_matches: list[ComponentMatch], usage_field: str, rule_id: str
) -> list[FindingDraft]:
    drafts: list[FindingDraft] = []
    for match in confirmed_matches:
        basis_a = primary_field(session, match.document_id_a, "usage_basis")
        basis_b = primary_field(session, match.document_id_b, "usage_basis")
        if basis_a is None or basis_b is None:
            continue  # usage basis unclear - not comparable, no finding
        if basis_a.value != basis_b.value or basis_a.value == "unspecified":
            continue  # different or unspecified bases must never produce a false discrepancy

        usage_a = primary_field(session, match.document_id_a, usage_field)
        usage_b = primary_field(session, match.document_id_b, usage_field)
        if usage_a is None or usage_b is None:
            continue
        num_a, num_b = parse_number(usage_a.value), parse_number(usage_b.value)
        if num_a is None or num_b is None:
            continue

        date_a = representative_document_date(session, match.document_id_a)
        date_b = representative_document_date(session, match.document_id_b)
        if date_a is None or date_b is None:
            continue  # chronology unclear - not comparable, no finding
        da, _ = date_a
        db, _ = date_b
        if da == db:
            continue  # can't order same-day records

        if da < db:
            earlier_ref, later_ref = usage_a, usage_b
            earlier_num, later_num = num_a, num_b
            earlier_doc, later_doc = match.document_id_a, match.document_id_b
        else:
            earlier_ref, later_ref = usage_b, usage_a
            earlier_num, later_num = num_b, num_a
            earlier_doc, later_doc = match.document_id_b, match.document_id_a

        if later_num < earlier_num:
            drafts.append(
                FindingDraft(
                    rule_id=rule_id,
                    rule_version="1.0.0",
                    severity="discrepancy",
                    title=f"Decreasing cumulative {usage_field.replace('_', ' ')}",
                    explanation=(
                        f"The earlier record ({earlier_doc}) reports {earlier_num} and the later "
                        f"record ({later_doc}) reports {later_num} {usage_field.replace('_', ' ')}, "
                        f"both measured '{basis_a.value}'. Cumulative usage should not decrease over time."
                    ),
                    affected_document_ids=[match.document_id_a, match.document_id_b],
                    affected_field_ids=[earlier_ref.field_id, later_ref.field_id],
                    evidence=[
                        {"document_id": earlier_doc, "page_number": earlier_ref.page_number, "excerpt": earlier_ref.evidence_text},
                        {"document_id": later_doc, "page_number": later_ref.page_number, "excerpt": later_ref.evidence_text},
                    ],
                    dedup_key=f"{rule_id}|{match.id}",
                )
            )
    return drafts


def check_decreasing_flight_hours(session: Session, confirmed_matches: list[ComponentMatch]) -> list[FindingDraft]:
    return _check_decreasing_usage(session, confirmed_matches, "flight_hours", "decreasing_flight_hours")


def check_decreasing_flight_cycles(session: Session, confirmed_matches: list[ComponentMatch]) -> list[FindingDraft]:
    return _check_decreasing_usage(session, confirmed_matches, "flight_cycles", "decreasing_flight_cycles")


def check_expected_document_missing(
    session: Session, documents: list[Document], require_release_record: bool
) -> list[FindingDraft]:
    """Rule: expected document category absent - only when explicitly required (spec 7)."""
    if not require_release_record:
        return []
    drafts: list[FindingDraft] = []
    status_sheets = [d for d in documents if d.document_category == "component_status_sheet"]
    release_records = [d for d in documents if d.document_category == "maintenance_release_record"]

    release_keys: set[tuple[str, str]] = set()
    for rec in release_records:
        pn = primary_field(session, rec.id, "part_number")
        sn = primary_field(session, rec.id, "serial_number")
        if pn and sn:
            release_keys.add((pn.value, sn.value))

    for sheet in status_sheets:
        pn = primary_field(session, sheet.id, "part_number")
        sn = primary_field(session, sheet.id, "serial_number")
        if not pn or not sn:
            continue  # identity unclear - needs_review is handled by the missing-identifier check
        if (pn.value, sn.value) not in release_keys:
            drafts.append(
                FindingDraft(
                    rule_id="expected_document_missing",
                    rule_version="1.0.0",
                    severity="expected_document_missing",
                    title=f"Expected maintenance/release record missing ({sheet.original_filename})",
                    explanation=(
                        f"This project requires a maintenance/release record for every component "
                        f"status sheet. No maintenance/release record was found for part "
                        f"'{pn.value}' / serial '{sn.value}'."
                    ),
                    affected_document_ids=[sheet.id],
                    affected_field_ids=[pn.field_id, sn.field_id],
                    evidence=[
                        {"document_id": sheet.id, "page_number": pn.page_number, "excerpt": pn.evidence_text},
                        {"document_id": sheet.id, "page_number": sn.page_number, "excerpt": sn.evidence_text},
                    ],
                    dedup_key=f"expected_document_missing|{sheet.id}|{pn.value}|{sn.value}",
                )
            )
    return drafts
