from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.auth import require_session
from app.config import (
    ANTHROPIC_MODEL,
    COOKIE_SECURE,
    CORS_ORIGINS,
    SESSION_SECRET,
    auth_enabled,
    live_mode_available,
)
from app.db import SessionLocal, init_db
from app.models import Document, ExtractedField, ProcessingJob
from app.routers import auth, documents, export, processing, projects


def _recover_interrupted_jobs() -> None:
    """On startup, any job left 'queued'/'running' means the previous process
    died mid-job. Mark it failed without touching the ExtractionRun/fields
    that already committed, so a fresh reprocess creates a new run instead
    of duplicating extraction records (spec section 5)."""
    db = SessionLocal()
    try:
        stuck = db.query(ProcessingJob).filter(ProcessingJob.status.in_(["queued", "running"])).all()
        for job in stuck:
            job.status = "failed"
            job.error_message = "Interrupted by a server restart before the job finished."
            document = db.get(Document, job.document_id)
            if document:
                has_fields = db.query(ExtractedField).filter(ExtractedField.document_id == document.id).first()
                document.status = "processed" if has_fields else "failed"
                if not has_fields:
                    document.error_message = job.error_message
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _recover_interrupted_jobs()
    yield


app = FastAPI(title="Aviation Records Workspace API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="ar_session",
    same_site="lax",
    https_only=COOKIE_SECURE,
    max_age=60 * 60 * 24 * 14,  # 14 days
)

# /api/auth/* and /api/status are intentionally public - everything else
# requires a valid session once ADMIN_PASSWORD is configured (see app/auth.py).
app.include_router(auth.router)
app.include_router(projects.router, dependencies=[Depends(require_session)])
app.include_router(documents.router, dependencies=[Depends(require_session)])
app.include_router(processing.router, dependencies=[Depends(require_session)])
app.include_router(export.router, dependencies=[Depends(require_session)])


@app.get("/api/status")
def status():
    return {
        "demo_mode_available": True,
        "live_mode_available": live_mode_available(),
        "live_model": ANTHROPIC_MODEL if live_mode_available() else None,
        "auth_enabled": auth_enabled(),
    }
