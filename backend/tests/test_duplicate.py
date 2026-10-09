from tests.conftest import upload_pdf


def _create_project(client, name="Dup Test Project"):
    return client.post("/api/projects", json={"name": name}).json()


def test_duplicate_within_project_is_flagged(client):
    project = _create_project(client)
    first = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    second = upload_pdf(client, project["id"], "A1_status_sheet.pdf")

    assert first["status"] == "uploaded"
    assert second["status"] == "duplicate"
    assert second["duplicate_of_document_id"] == first["id"]
    assert first["sha256"] == second["sha256"]

    docs = client.get(f"/api/projects/{project['id']}/documents").json()
    assert len(docs) == 2


def test_same_file_in_different_projects_is_not_a_duplicate(client):
    project_a = _create_project(client, "Project A")
    project_b = _create_project(client, "Project B")

    doc_a = upload_pdf(client, project_a["id"], "A1_status_sheet.pdf")
    doc_b = upload_pdf(client, project_b["id"], "A1_status_sheet.pdf")

    assert doc_a["status"] == "uploaded"
    assert doc_b["status"] == "uploaded"


def test_duplicate_document_cannot_be_processed(client):
    project = _create_project(client)
    first = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    second = upload_pdf(client, project["id"], "A1_status_sheet.pdf")

    resp = client.post(
        f"/api/documents/{second['id']}/jobs",
        json={"mode": "demo", "page_start": 1, "page_end": 1},
    )
    assert resp.status_code == 400
