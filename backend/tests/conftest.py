import os
import shutil
import tempfile
from pathlib import Path

_TMP_ROOT = Path(tempfile.mkdtemp(prefix="aviation_test_"))
os.environ["STORAGE_DIR"] = str(_TMP_ROOT / "storage")
os.environ["DB_PATH"] = str(_TMP_ROOT / "test.db")
os.environ["ANTHROPIC_API_KEY"] = ""  # tests run in demo mode only

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"
PDFS_DIR = FIXTURES_DIR / "pdfs"


@pytest.fixture(autouse=True)
def _fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    storage_dir = Path(os.environ["STORAGE_DIR"])
    if storage_dir.exists():
        shutil.rmtree(storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def upload_pdf(client: TestClient, project_id: str, filename: str) -> dict:
    path = PDFS_DIR / filename
    with open(path, "rb") as f:
        resp = client.post(
            f"/api/projects/{project_id}/documents",
            files={"file": (filename, f, "application/pdf")},
        )
    assert resp.status_code == 200, resp.text
    return resp.json()


def process_document(client: TestClient, document_id: str, page_start=1, page_end=1, mode="demo", force=False) -> dict:
    resp = client.post(
        f"/api/documents/{document_id}/jobs",
        json={"mode": mode, "page_start": page_start, "page_end": page_end, "force": force},
    )
    assert resp.status_code == 200, resp.text
    job = resp.json()
    # BackgroundTasks run synchronously within the TestClient's request lifecycle.
    doc = client.get(f"/api/documents/{document_id}").json()
    return {"job": job, "document": doc}
