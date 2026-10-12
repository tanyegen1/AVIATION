from app.db import SessionLocal
from app.models import ExtractedField
from tests.conftest import process_document, upload_pdf


def test_reprocess_shows_only_current_run_but_keeps_history(client):
    project = client.post("/api/projects", json={"name": "Reprocess"}).json()
    doc = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    process_document(client, doc["id"])
    first = client.get(f"/api/documents/{doc['id']}/fields").json()

    process_document(client, doc["id"], force=True)
    second = client.get(f"/api/documents/{doc['id']}/fields").json()

    # Same number of fields as one run - not doubled - and they're the new run's rows.
    assert len(second) == len(first)
    assert {f["run_id"] for f in second} != {f["run_id"] for f in first}
    assert len({f["run_id"] for f in second}) == 1

    # The earlier run's rows are still stored as history.
    db = SessionLocal()
    try:
        stored = db.query(ExtractedField).filter(ExtractedField.document_id == doc["id"]).count()
    finally:
        db.close()
    assert stored == len(first) * 2

    # Rules see one current value per field, so no duplicate findings or matches appear.
    assert client.get(f"/api/projects/{project['id']}/findings").json() == []
    summary = client.get(f"/api/projects/{project['id']}/summary").json()
    assert summary["fields"]["total"] == len(second)


def test_failed_reprocess_keeps_previous_fields_visible(client, monkeypatch):
    project = client.post("/api/projects", json={"name": "Reprocess fail"}).json()
    doc = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    process_document(client, doc["id"])
    before = client.get(f"/api/documents/{doc['id']}/fields").json()

    from app.extraction import ExtractionError
    from app.extraction.demo_provider import DemoExtractionProvider

    def boom(self, **kwargs):
        raise ExtractionError("simulated outage")

    monkeypatch.setattr(DemoExtractionProvider, "extract_page", boom)
    process_document(client, doc["id"], force=True)

    after = client.get(f"/api/documents/{doc['id']}/fields").json()
    assert [f["id"] for f in after] == [f["id"] for f in before]
