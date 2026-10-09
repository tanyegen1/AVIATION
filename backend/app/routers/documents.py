from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import MAX_PAGE_COUNT, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB
from app.db import get_db
from app.models import Document, ExtractedField, ExtractionRun, ProcessingJob
from app.pdf_utils import PdfValidationError, validate_and_inspect
from app.routers.projects import _get_project_or_404
from app.schemas import DocumentCategoryUpdate
from app.serializers import document_out
from app.storage import document_path, save_upload

router = APIRouter(tags=["documents"])


@router.post("/api/projects/{project_id}/documents")
async def upload_document(project_id: str, file: UploadFile, db: Session = Depends(get_db)):
    project = _get_project_or_404(db, project_id)

    if file.content_type not in ("application/pdf", "application/x-pdf") and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted in this version.")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail=f"File exceeds the {MAX_UPLOAD_MB:.0f} MB upload limit.")

    try:
        info = validate_and_inspect(content)
    except PdfValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if info.page_count > MAX_PAGE_COUNT:
        raise HTTPException(
            status_code=400,
            detail=f"This PDF has {info.page_count} pages, exceeding the {MAX_PAGE_COUNT}-page limit.",
        )

    storage_filename, sha256 = save_upload(project_id, content)

    existing = (
        db.query(Document)
        .filter(Document.project_id == project_id, Document.sha256 == sha256)
        .first()
    )

    document = Document(
        project_id=project_id,
        original_filename=file.filename,
        storage_filename=storage_filename,
        sha256=sha256,
        size_bytes=len(content),
        page_count=info.page_count,
        status="duplicate" if existing else "uploaded",
        duplicate_of_document_id=existing.id if existing else None,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document_out(document)


@router.get("/api/projects/{project_id}/documents")
def list_documents(project_id: str, db: Session = Depends(get_db)):
    _get_project_or_404(db, project_id)
    docs = (
        db.query(Document)
        .filter(Document.project_id == project_id)
        .order_by(Document.uploaded_at.desc())
        .all()
    )
    return [document_out(d) for d in docs]


def _get_document_or_404(db: Session, document_id: str) -> Document:
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


@router.get("/api/documents/{document_id}")
def get_document(document_id: str, db: Session = Depends(get_db)):
    return document_out(_get_document_or_404(db, document_id))


@router.get("/api/documents/{document_id}/file")
def get_document_file(document_id: str, db: Session = Depends(get_db)):
    doc = _get_document_or_404(db, document_id)
    path = document_path(doc.project_id, doc.storage_filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file is missing.")
    return FileResponse(path, media_type="application/pdf", filename=doc.original_filename)


@router.patch("/api/documents/{document_id}")
def update_document_category(document_id: str, body: DocumentCategoryUpdate, db: Session = Depends(get_db)):
    doc = _get_document_or_404(db, document_id)
    doc.document_category = body.document_category
    doc.category_source = "manual"
    db.commit()
    db.refresh(doc)

    from app.rules.engine import run_rules_for_project

    run_rules_for_project(db, doc.project_id)
    return document_out(doc)


@router.delete("/api/documents/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db)):
    doc = _get_document_or_404(db, document_id)
    path = document_path(doc.project_id, doc.storage_filename)
    path.unlink(missing_ok=True)

    db.query(ExtractedField).filter(ExtractedField.document_id == document_id).delete(synchronize_session=False)
    db.query(ExtractionRun).filter(ExtractionRun.document_id == document_id).delete(synchronize_session=False)
    db.query(ProcessingJob).filter(ProcessingJob.document_id == document_id).delete(synchronize_session=False)
    db.delete(doc)
    db.commit()
    return {"deleted": True}
