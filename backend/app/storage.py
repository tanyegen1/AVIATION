"""Local filesystem storage for uploaded documents.

Storage lives under app.config.STORAGE_DIR, outside any directory a web
server would serve as static assets. Files are named by a generated
identifier; the caller keeps the original filename as metadata in the DB.
"""
from __future__ import annotations

import hashlib
import uuid
from pathlib import Path

from app.config import STORAGE_DIR


def project_dir(project_id: str) -> Path:
    d = STORAGE_DIR / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_upload(project_id: str, content: bytes) -> tuple[str, str]:
    """Save raw bytes to disk. Returns (storage_filename, sha256_hex)."""
    sha256 = hashlib.sha256(content).hexdigest()
    storage_filename = f"{uuid.uuid4().hex}.pdf"
    path = project_dir(project_id) / storage_filename
    path.write_bytes(content)
    return storage_filename, sha256


def document_path(project_id: str, storage_filename: str) -> Path:
    return project_dir(project_id) / storage_filename


def delete_project_files(project_id: str) -> None:
    d = STORAGE_DIR / project_id
    if not d.exists():
        return
    for f in d.iterdir():
        f.unlink(missing_ok=True)
    d.rmdir()
