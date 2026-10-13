"""Rules engine orchestration: component matching + discrepancy checks.

Running the engine is idempotent and safe to call repeatedly (e.g. after
a new upload or a reviewer correction): it never duplicates an existing
finding, never recreates one a reviewer already dismissed or resolved,
and marks findings whose underlying condition no longer reproduces as
`stale` so a reviewer re-checks them instead of a stale conclusion being
silently preserved.
"""
from __future__ import annotations

import json
import threading
from collections import defaultdict

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.config import RULES_ENGINE_VERSION
from app.models import ComponentMatch, Finding, Project, RuleRun
from app.rules.checks import (
    FindingDraft,
    check_conflicting_identity_values,
    check_decreasing_flight_cycles,
    check_decreasing_flight_hours,
    check_expected_document_missing,
    check_required_identifiers,
)
from app.rules.helpers import primary_field, processed_documents

# Processing jobs run in worker threads, so two documents finishing together
# would otherwise run the rules concurrently and both insert the same match
# suggestion. One process serves the whole app (see CLAUDE.md), so a
# process-wide lock is enough to make rule runs one-at-a-time.
_RULES_LOCK = threading.Lock()


def generate_component_match_suggestions(session: Session, documents: list) -> list[ComponentMatch]:
    by_key: dict[tuple[str, str], list] = defaultdict(list)
    for doc in documents:
        pn = primary_field(session, doc.id, "part_number")
        sn = primary_field(session, doc.id, "serial_number")
        if pn and sn:
            by_key[(pn.value, sn.value)].append(doc)

    created: list[ComponentMatch] = []
    for (pn_val, sn_val), docs in by_key.items():
        for i in range(len(docs)):
            for j in range(i + 1, len(docs)):
                a, b = docs[i], docs[j]
                exists = (
                    session.query(ComponentMatch)
                    .filter(
                        ComponentMatch.project_id == a.project_id,
                        or_(
                            and_(ComponentMatch.document_id_a == a.id, ComponentMatch.document_id_b == b.id),
                            and_(ComponentMatch.document_id_a == b.id, ComponentMatch.document_id_b == a.id),
                        ),
                    )
                    .first()  # tolerate duplicates left by older versions
                )
                if exists:
                    continue
                match = ComponentMatch(
                    project_id=a.project_id,
                    document_id_a=a.id,
                    document_id_b=b.id,
                    match_basis="part_number+serial_number",
                    part_number=pn_val,
                    serial_number=sn_val,
                    status="suggested",
                )
                session.add(match)
                created.append(match)
    session.flush()
    return created


def _persist_drafts(session: Session, project_id: str, drafts: list[FindingDraft]) -> tuple[int, dict[str, set[str]]]:
    created = 0
    dedup_keys_by_rule: dict[str, set[str]] = defaultdict(set)
    for draft in drafts:
        dedup_keys_by_rule[draft.rule_id].add(draft.dedup_key)
        existing = (
            session.query(Finding)
            .filter_by(project_id=project_id, dedup_key=draft.dedup_key)
            .one_or_none()
        )
        if existing:
            if existing.stale:
                existing.stale = False
            continue
        finding = Finding(
            project_id=project_id,
            rule_id=draft.rule_id,
            rule_version=draft.rule_version,
            severity=draft.severity,
            dedup_key=draft.dedup_key,
            title=draft.title,
            explanation=draft.explanation,
            affected_document_ids_json=json.dumps(draft.affected_document_ids),
            affected_field_ids_json=json.dumps(draft.affected_field_ids),
            evidence_json=json.dumps(draft.evidence),
            status="open",
        )
        session.add(finding)
        created += 1
    return created, dedup_keys_by_rule


def _mark_stale_findings(session: Session, project_id: str, rule_ids_executed: list[str], dedup_keys_by_rule: dict[str, set[str]]) -> None:
    for rule_id in rule_ids_executed:
        live_keys = dedup_keys_by_rule.get(rule_id, set())
        existing_findings = (
            session.query(Finding)
            .filter(Finding.project_id == project_id, Finding.rule_id == rule_id, Finding.status.in_(["open", "confirmed"]))
            .all()
        )
        for finding in existing_findings:
            if finding.dedup_key not in live_keys:
                finding.stale = True


def run_rules_for_project(session: Session, project_id: str) -> RuleRun:
    with _RULES_LOCK:
        return _run_rules_for_project(session, project_id)


def _run_rules_for_project(session: Session, project_id: str) -> RuleRun:
    project = session.get(Project, project_id)
    documents = processed_documents(session, project_id)

    generate_component_match_suggestions(session, documents)
    confirmed_matches = (
        session.query(ComponentMatch).filter_by(project_id=project_id, status="confirmed").all()
    )

    rule_ids_executed: list[str] = ["required_identifiers_missing"]
    rule_ids_skipped: list[str] = []
    drafts: list[FindingDraft] = list(check_required_identifiers(session, documents))

    if confirmed_matches:
        drafts += check_conflicting_identity_values(session, confirmed_matches)
        drafts += check_decreasing_flight_hours(session, confirmed_matches)
        drafts += check_decreasing_flight_cycles(session, confirmed_matches)
        rule_ids_executed += [
            "conflicting_identity_values",
            "decreasing_flight_hours",
            "decreasing_flight_cycles",
        ]
    else:
        rule_ids_skipped += [
            "conflicting_identity_values (no confirmed component matches yet)",
            "decreasing_flight_hours (no confirmed component matches yet)",
            "decreasing_flight_cycles (no confirmed component matches yet)",
        ]

    require_release = bool(project.require_maintenance_release_for_status_sheets)
    if require_release:
        drafts += check_expected_document_missing(session, documents, True)
        rule_ids_executed.append("expected_document_missing")
    else:
        rule_ids_skipped.append("expected_document_missing (not required for this project)")

    findings_created, dedup_keys_by_rule = _persist_drafts(session, project_id, drafts)
    _mark_stale_findings(session, project_id, rule_ids_executed, dedup_keys_by_rule)

    rule_run = RuleRun(
        project_id=project_id,
        rules_engine_version=RULES_ENGINE_VERSION,
        rule_ids_executed_json=json.dumps(rule_ids_executed),
        rule_ids_skipped_json=json.dumps(rule_ids_skipped),
        findings_created=findings_created,
    )
    session.add(rule_run)
    session.commit()
    return rule_run
