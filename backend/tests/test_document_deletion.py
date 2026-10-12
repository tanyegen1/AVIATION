from tests.conftest import process_document, upload_pdf


def _project(client):
    return client.post("/api/projects", json={"name": "Deletion"}).json()


def test_deleting_an_original_promotes_its_duplicate(client):
    project = _project(client)
    original = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    dup1 = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    dup2 = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    process_document(client, original["id"])

    r = client.delete(f"/api/documents/{original['id']}")
    assert r.status_code == 200

    d1 = client.get(f"/api/documents/{dup1['id']}").json()
    d2 = client.get(f"/api/documents/{dup2['id']}").json()
    assert d1["status"] == "uploaded" and d1["duplicate_of_document_id"] is None
    assert d2["status"] == "duplicate" and d2["duplicate_of_document_id"] == dup1["id"]


def test_deleting_a_matched_document_removes_match_and_flags_findings(client):
    project = _project(client)
    a = upload_pdf(client, project["id"], "D1_status_sheet.pdf")
    b = upload_pdf(client, project["id"], "D1_release_record.pdf")
    process_document(client, a["id"])
    process_document(client, b["id"])
    match = client.get(f"/api/projects/{project['id']}/matches").json()[0]
    client.patch(f"/api/matches/{match['id']}", json={"status": "confirmed"})
    findings = client.get(f"/api/projects/{project['id']}/findings").json()
    cited = [f for f in findings if b["id"] in f["affected_document_ids"]]
    assert cited, "D1 pair should produce a cross-record finding once confirmed"

    r = client.delete(f"/api/documents/{b['id']}")
    assert r.status_code == 200

    assert client.get(f"/api/projects/{project['id']}/matches").json() == []
    after = {f["id"]: f for f in client.get(f"/api/projects/{project['id']}/findings").json()}
    for f in cited:
        assert after[f["id"]]["stale"] is True
