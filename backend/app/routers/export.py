"""CSV and PDF report export (spec section 9).

Both formats are built straight from the project's current review state -
nothing here re-runs extraction or invents summary numbers. Dismissed
findings are excluded from the PDF narrative by default (spec: "Allow
reviewers to exclude dismissed findings from the main report while
retaining them in the audit history") but the CSV audit export always
includes every finding with its status, so the full history is never lost.
"""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from app.config import EXTRACTION_SCHEMA_VERSION, RULES_ENGINE_VERSION
from app.db import get_db
from app.models import ComponentMatch, Document, ExtractedField, Finding, ProcessingJob, RuleRun
from app.routers.projects import _get_project_or_404

router = APIRouter(tags=["export"])

DISCLAIMER = (
    "This report supports human review of aviation technical records. It does not certify "
    "airworthiness, authenticate source documents, or constitute a regulatory compliance decision. "
    "All findings require qualified human judgment before any maintenance or airworthiness action."
)


def _gather_report_data(db: Session, project_id: str, include_dismissed: bool):
    project = _get_project_or_404(db, project_id)
    documents = db.query(Document).filter(Document.project_id == project_id).order_by(Document.uploaded_at).all()
    jobs = db.query(ProcessingJob).join(Document).filter(Document.project_id == project_id).all()
    findings_q = db.query(Finding).filter(Finding.project_id == project_id)
    if not include_dismissed:
        findings_q = findings_q.filter(Finding.status != "dismissed")
    findings = findings_q.order_by(Finding.created_at).all()
    all_findings = db.query(Finding).filter(Finding.project_id == project_id).order_by(Finding.created_at).all()
    latest_rule_run = (
        db.query(RuleRun).filter(RuleRun.project_id == project_id).order_by(RuleRun.created_at.desc()).first()
    )
    matches = db.query(ComponentMatch).filter(ComponentMatch.project_id == project_id).all()
    doc_by_id = {d.id: d for d in documents}

    unresolved = []
    for f in all_findings:
        if f.status in ("open",) or f.stale:
            unresolved.append(f)
    flagged_fields = (
        db.query(ExtractedField)
        .join(Document)
        .filter(Document.project_id == project_id, ExtractedField.review_status == "flagged_unreadable")
        .all()
    )
    suggested_matches = [m for m in matches if m.status == "suggested"]

    return {
        "project": project,
        "documents": documents,
        "doc_by_id": doc_by_id,
        "jobs": jobs,
        "findings": findings,
        "all_findings": all_findings,
        "unresolved": unresolved,
        "flagged_fields": flagged_fields,
        "suggested_matches": suggested_matches,
        "latest_rule_run": latest_rule_run,
    }


@router.get("/api/projects/{project_id}/export.csv")
def export_csv(project_id: str, db: Session = Depends(get_db)):
    # The CSV is the audit trail, so it always keeps the full finding history
    # (including dismissed) regardless of the PDF's include_dismissed choice.
    data = _gather_report_data(db, project_id, include_dismissed=True)
    project = data["project"]

    buf = io.StringIO()
    writer = csv.writer(buf)

    writer.writerow(["Aviation Records Workspace - Export"])
    writer.writerow(["Project", project.name])
    writer.writerow(["Generated at", datetime.utcnow().isoformat() + "Z"])
    writer.writerow(["Extraction schema version", EXTRACTION_SCHEMA_VERSION])
    writer.writerow(["Rules engine version", RULES_ENGINE_VERSION])
    writer.writerow(["Notice", DISCLAIMER])
    writer.writerow([])

    writer.writerow(["== Documents =="])
    writer.writerow(["filename", "category", "category_source", "status", "page_count", "sha256"])
    for d in data["documents"]:
        writer.writerow([d.original_filename, d.document_category, d.category_source, d.status, d.page_count, d.sha256])
    writer.writerow([])

    writer.writerow(["== Processing jobs (pages processed / failed) =="])
    writer.writerow(["document", "mode", "status", "page_start", "page_end", "pages_processed", "pages_failed", "failed_pages"])
    for j in data["jobs"]:
        doc = data["doc_by_id"].get(j.document_id)
        writer.writerow(
            [
                doc.original_filename if doc else j.document_id,
                j.mode,
                j.status,
                j.page_start,
                j.page_end,
                j.pages_processed,
                j.pages_failed,
                j.failed_pages_json or "[]",
            ]
        )
    writer.writerow([])

    writer.writerow(["== Checks performed / skipped (latest rule run) =="])
    if data["latest_rule_run"]:
        writer.writerow(["executed", json.dumps(json.loads(data["latest_rule_run"].rule_ids_executed_json))])
        writer.writerow(["skipped", json.dumps(json.loads(data["latest_rule_run"].rule_ids_skipped_json))])
    else:
        writer.writerow(["No rule run has been executed for this project yet."])
    writer.writerow([])

    writer.writerow(["== Findings (full audit history, including dismissed) =="])
    writer.writerow(
        ["rule_id", "severity", "title", "status", "stale_needs_rereview", "explanation", "affected_documents", "reviewer_note", "created_at"]
    )
    for f in data["all_findings"]:
        doc_names = [
            data["doc_by_id"][d_id].original_filename
            for d_id in json.loads(f.affected_document_ids_json)
            if d_id in data["doc_by_id"]
        ]
        writer.writerow(
            [f.rule_id, f.severity, f.title, f.status, f.stale, f.explanation, "; ".join(doc_names), f.reviewer_note or "", f.created_at.isoformat()]
        )
    writer.writerow([])

    writer.writerow(["== Unresolved uncertainties =="])
    writer.writerow(["open or stale findings", len(data["unresolved"])])
    writer.writerow(["fields flagged unreadable", len(data["flagged_fields"])])
    writer.writerow(["component matches awaiting confirmation", len(data["suggested_matches"])])

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{project.name}_export.csv"'},
    )


def _build_pdf(data: dict) -> bytes:
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleCenter", parent=styles["Title"], alignment=TA_CENTER)
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8, leading=10)
    h2 = styles["Heading2"]
    normal = styles["Normal"]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, topMargin=0.6 * inch, bottomMargin=0.6 * inch)
    story = []

    project = data["project"]
    story.append(Paragraph("Aviation Records Workspace", title_style))
    story.append(Paragraph("Review Support Report (not an airworthiness certification)", styles["Heading3"]))
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"<b>Project:</b> {project.name}", normal))
    if project.description:
        story.append(Paragraph(f"<b>Description:</b> {project.description}", normal))
    story.append(Paragraph(f"<b>Generated:</b> {datetime.utcnow().isoformat()}Z", normal))
    story.append(
        Paragraph(
            f"<b>Extraction schema version:</b> {EXTRACTION_SCHEMA_VERSION} &nbsp;&nbsp; "
            f"<b>Rules engine version:</b> {RULES_ENGINE_VERSION}",
            normal,
        )
    )
    story.append(Spacer(1, 10))
    story.append(Paragraph(DISCLAIMER, ParagraphStyle("Notice", parent=normal, textColor=colors.HexColor("#8a3b00"))))
    story.append(Spacer(1, 16))

    story.append(Paragraph("Document Scope", h2))
    doc_rows = [["Filename", "Category", "Status", "Pages"]]
    for d in data["documents"]:
        doc_rows.append([d.original_filename, d.document_category, d.status, str(d.page_count or "-")])
    story.append(_table(doc_rows))
    story.append(Spacer(1, 14))

    story.append(Paragraph("Pages Processed / Failed", h2))
    job_rows = [["Document", "Mode", "Status", "Processed", "Failed"]]
    for j in data["jobs"]:
        d = data["doc_by_id"].get(j.document_id)
        job_rows.append([d.original_filename if d else "-", j.mode, j.status, str(j.pages_processed), str(j.pages_failed)])
    if len(job_rows) == 1:
        story.append(Paragraph("No processing jobs have been run yet.", normal))
    else:
        story.append(_table(job_rows))
    story.append(Spacer(1, 14))

    story.append(Paragraph("Checks Performed / Skipped", h2))
    if data["latest_rule_run"]:
        executed = json.loads(data["latest_rule_run"].rule_ids_executed_json)
        skipped = json.loads(data["latest_rule_run"].rule_ids_skipped_json)
        story.append(Paragraph(f"<b>Performed:</b> {', '.join(executed) or 'none'}", small))
        story.append(Paragraph(f"<b>Skipped:</b> {', '.join(skipped) or 'none'}", small))
    else:
        story.append(Paragraph("No rule run has been executed for this project yet.", normal))
    story.append(Spacer(1, 14))

    story.append(Paragraph("Findings", h2))
    if not data["findings"]:
        story.append(Paragraph("No findings from the selected checks.", normal))
    else:
        for f in data["findings"]:
            doc_names = [
                data["doc_by_id"][d_id].original_filename
                for d_id in json.loads(f.affected_document_ids_json)
                if d_id in data["doc_by_id"]
            ]
            story.append(
                Paragraph(
                    f"<b>[{f.severity.upper()}] {f.title}</b> &mdash; status: {f.status}"
                    + (" (STALE - needs re-review)" if f.stale else ""),
                    styles["Heading4"],
                )
            )
            story.append(Paragraph(f.explanation, normal))
            story.append(Paragraph(f"<i>Documents:</i> {', '.join(doc_names)}", small))
            for ev in json.loads(f.evidence_json):
                dname = data["doc_by_id"].get(ev.get("document_id"))
                dname = dname.original_filename if dname else ev.get("document_id")
                story.append(
                    Paragraph(
                        f"<i>Evidence:</i> {dname}, page {ev.get('page_number', '?')}: "
                        f"“{(ev.get('excerpt') or '').strip()[:300]}”",
                        small,
                    )
                )
            if f.reviewer_note:
                story.append(Paragraph(f"<i>Reviewer note:</i> {f.reviewer_note}", small))
            story.append(Spacer(1, 8))
    story.append(Spacer(1, 14))

    story.append(Paragraph("Unresolved Uncertainties", h2))
    story.append(
        Paragraph(
            f"Open or stale findings: {len(data['unresolved'])} &nbsp;&nbsp; "
            f"Fields flagged unreadable: {len(data['flagged_fields'])} &nbsp;&nbsp; "
            f"Component matches awaiting confirmation: {len(data['suggested_matches'])}",
            normal,
        )
    )

    doc.build(story)
    buf.seek(0)
    return buf.read()


def _table(rows: list[list[str]]) -> Table:
    t = Table(rows, hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0a2540")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
            ]
        )
    )
    return t


@router.get("/api/projects/{project_id}/export.pdf")
def export_pdf(project_id: str, include_dismissed: bool = Query(default=False), db: Session = Depends(get_db)):
    data = _gather_report_data(db, project_id, include_dismissed=include_dismissed)
    pdf_bytes = _build_pdf(data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{data["project"].name}_report.pdf"'},
    )
