from app.storage import document_path
from tests.conftest import process_document, upload_pdf


def test_deleting_project_removes_uploaded_files(client):
    project = client.post("/api/projects", json={"name": "Delete Me"}).json()
    doc = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    process_document(client, doc["id"])

    path = document_path(project["id"], doc["storage_filename"])
    assert path.exists()

    resp = client.delete(f"/api/projects/{project['id']}")
    assert resp.status_code == 200
    assert not path.exists()

    resp_get = client.get(f"/api/projects/{project['id']}")
    assert resp_get.status_code == 404
