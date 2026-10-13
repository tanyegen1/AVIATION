"""Pydantic request bodies. Responses are plain dicts built by each router's
serializer function - this is a small MVP and a parallel set of response
models would just be duplicated bookkeeping."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    require_maintenance_release_for_status_sheets: bool | None = None


class DocumentCategoryUpdate(BaseModel):
    document_category: Literal["component_status_sheet", "maintenance_release_record", "unknown_type"]


class JobCreate(BaseModel):
    mode: Literal["demo", "live"]
    page_start: int = Field(ge=1)
    page_end: int = Field(ge=1)
    force: bool = False


class FieldCorrection(BaseModel):
    corrected_value: str | None = None
    corrected_note: str | None = None


class FieldFlagUnreadable(BaseModel):
    corrected_note: str | None = None


class MatchDecision(BaseModel):
    # "suggested" undoes an earlier decision and puts the pair back in review.
    status: Literal["confirmed", "rejected", "suggested"]
    reviewer_note: str | None = None


class FindingDecision(BaseModel):
    status: Literal["confirmed", "dismissed", "resolved", "open"]
    reviewer_note: str | None = None
