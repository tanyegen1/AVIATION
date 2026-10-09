"""SQLAlchemy models.

Naming and status-enum conventions are plain strings (not SQL enums) so
SQLite migrations never require an ALTER TYPE. Validate allowed values
at the API boundary (schemas.py), not here.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    require_maintenance_release_for_status_sheets = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="project", cascade="all, delete-orphan")
    matches = relationship("ComponentMatch", back_populates="project", cascade="all, delete-orphan")
    rule_runs = relationship("RuleRun", back_populates="project", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)

    original_filename = Column(String, nullable=False)
    storage_filename = Column(String, nullable=False)  # generated identifier on disk
    sha256 = Column(String, nullable=False, index=True)
    size_bytes = Column(Integer, nullable=False)
    page_count = Column(Integer, nullable=True)

    # unknown_type | component_status_sheet | maintenance_release_record
    document_category = Column(String, nullable=False, default="unknown_type")
    category_source = Column(String, nullable=False, default="unclassified")  # manual | ai_suggested | unclassified

    is_scanned = Column(Boolean, nullable=True)  # null until first processing pass inspects pages
    status = Column(String, nullable=False, default="uploaded")
    # uploaded | queued | processing | processed | failed | duplicate

    duplicate_of_document_id = Column(String, ForeignKey("documents.id"), nullable=True)
    error_message = Column(Text, nullable=True)

    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="documents")
    jobs = relationship("ProcessingJob", back_populates="document", cascade="all, delete-orphan")
    fields = relationship("ExtractedField", back_populates="document", cascade="all, delete-orphan")
    # Duplicate detection (same sha256 within a project) is handled in the
    # upload endpoint, not via a DB constraint - a duplicate upload is still
    # stored (preserving the original document, spec section 5) and flagged
    # with status="duplicate" rather than being rejected outright.


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(String, primary_key=True, default=_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False, index=True)

    mode = Column(String, nullable=False)  # demo | live
    page_start = Column(Integer, nullable=False)
    page_end = Column(Integer, nullable=False)

    status = Column(String, nullable=False, default="queued")
    # queued | running | completed | failed | cancelled

    pages_processed = Column(Integer, nullable=False, default=0)
    pages_failed = Column(Integer, nullable=False, default=0)
    failed_pages_json = Column(Text, nullable=True)  # JSON list of {page, reason}

    retries_used = Column(Integer, nullable=False, default=0)
    cancel_requested = Column(Boolean, nullable=False, default=False)

    model_id = Column(String, nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)

    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    document = relationship("Document", back_populates="jobs")
    extraction_run = relationship("ExtractionRun", back_populates="job", uselist=False, cascade="all, delete-orphan")


class ExtractionRun(Base):
    """One completed (or partially completed) extraction pass for a document."""

    __tablename__ = "extraction_runs"

    id = Column(String, primary_key=True, default=_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False, index=True)
    job_id = Column(String, ForeignKey("processing_jobs.id"), nullable=False, unique=True)

    extraction_version = Column(String, nullable=False)
    mode = Column(String, nullable=False)  # demo | live
    model_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    job = relationship("ProcessingJob", back_populates="extraction_run")
    fields = relationship("ExtractedField", back_populates="run", cascade="all, delete-orphan")


class ExtractedField(Base):
    __tablename__ = "extracted_fields"

    id = Column(String, primary_key=True, default=_uuid)
    run_id = Column(String, ForeignKey("extraction_runs.id"), nullable=False, index=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False, index=True)

    field_name = Column(String, nullable=False)
    qualifier = Column(String, nullable=True)  # e.g. for field_name="date": "manufacture_date", "release_date"
    raw_value = Column(Text, nullable=True)  # null = unreadable / absent, never guessed
    normalized_value = Column(Text, nullable=True)

    page_number = Column(Integer, nullable=True)
    evidence_text = Column(Text, nullable=True)
    evidence_verification = Column(String, nullable=False, default="unverified")
    # text_verified | text_mismatch | requires_visual_verification | unverified | no_evidence

    self_reported_confidence = Column(String, nullable=True)  # model's own label, never shown as a probability

    review_status = Column(String, nullable=False, default="unreviewed")
    # unreviewed | confirmed | corrected | flagged_unreadable

    corrected_value = Column(Text, nullable=True)
    corrected_at = Column(DateTime, nullable=True)
    corrected_note = Column(Text, nullable=True)

    needs_rereview = Column(Boolean, nullable=False, default=False)

    run = relationship("ExtractionRun", back_populates="fields")
    document = relationship("Document", back_populates="fields")

    def effective_value(self) -> str | None:
        if self.review_status == "flagged_unreadable":
            return None  # reviewer override: treat as missing, regardless of the AI's raw/normalized value
        if self.review_status == "corrected":
            return self.corrected_value
        return self.normalized_value if self.normalized_value is not None else self.raw_value


class ComponentMatch(Base):
    """A suggested or confirmed link between two documents referring to the same component/event."""

    __tablename__ = "component_matches"

    id = Column(String, primary_key=True, default=_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    document_id_a = Column(String, ForeignKey("documents.id"), nullable=False)
    document_id_b = Column(String, ForeignKey("documents.id"), nullable=False)

    match_basis = Column(String, nullable=False)  # e.g. "part_number+serial_number"
    part_number = Column(String, nullable=True)
    serial_number = Column(String, nullable=True)

    status = Column(String, nullable=False, default="suggested")  # suggested | confirmed | rejected
    reviewed_at = Column(DateTime, nullable=True)
    reviewer_note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="matches")


class Finding(Base):
    __tablename__ = "findings"

    id = Column(String, primary_key=True, default=_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)

    rule_id = Column(String, nullable=False)
    rule_version = Column(String, nullable=False)
    severity = Column(String, nullable=False, default="needs_review")
    # discrepancy | needs_review | missing_identifier | expected_document_missing
    dedup_key = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    explanation = Column(Text, nullable=False)

    affected_document_ids_json = Column(Text, nullable=False, default="[]")
    affected_field_ids_json = Column(Text, nullable=False, default="[]")
    evidence_json = Column(Text, nullable=False, default="[]")

    status = Column(String, nullable=False, default="open")  # open | confirmed | dismissed | resolved
    stale = Column(Boolean, nullable=False, default=False)
    reviewer_note = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="findings")


class RuleRun(Base):
    """Record of a rules-engine execution, so the export can list checks performed."""

    __tablename__ = "rule_runs"

    id = Column(String, primary_key=True, default=_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    rules_engine_version = Column(String, nullable=False)
    rule_ids_executed_json = Column(Text, nullable=False, default="[]")
    rule_ids_skipped_json = Column(Text, nullable=False, default="[]")
    findings_created = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="rule_runs")
