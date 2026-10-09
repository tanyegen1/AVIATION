from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Document, Project
from app.schemas import ProjectCreate, ProjectUpdate
from app.serializers import project_out
from app.storage import delete_project_files

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("")
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(name=body.name, description=body.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project_out(project)


@router.get("")
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).filter(Project.deleted_at.is_(None)).order_by(Project.created_at.desc()).all()
    out = []
    for p in projects:
        count = db.query(Document).filter(Document.project_id == p.id).count()
        out.append(project_out(p, document_count=count))
    return out


def _get_project_or_404(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = _get_project_or_404(db, project_id)
    count = db.query(Document).filter(Document.project_id == project.id).count()
    return project_out(project, document_count=count)


@router.patch("/{project_id}")
def update_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db)):
    project = _get_project_or_404(db, project_id)
    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    if body.require_maintenance_release_for_status_sheets is not None:
        project.require_maintenance_release_for_status_sheets = body.require_maintenance_release_for_status_sheets
    db.commit()
    db.refresh(project)
    count = db.query(Document).filter(Document.project_id == project.id).count()
    return project_out(project, document_count=count)


@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = _get_project_or_404(db, project_id)
    delete_project_files(project_id)
    db.delete(project)
    db.commit()
    return {"deleted": True}
