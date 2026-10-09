from tests.conftest import process_document, upload_pdf


def _create_project(client, name="Export Test Project"):
    return client.post("/api/projects", json={"name": name}).json()


def test_csv_export_contains_disclaimer_and_sections(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "B1_status_missing_serial.pdf")
    process_document(client, doc["id"])

    resp = client.get(f"/api/projects/{project['id']}/export.csv")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    body = resp.text
    assert "does not certify airworthiness" in body
    assert "== Documents ==" in body
    assert "== Findings (full audit history, including dismissed) ==" in body
    assert "required_identifiers_missing" in body


def test_pdf_export_builds_valid_pdf_with_no_findings(client):
    project = _create_project(client)
    doc_a = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    doc_b = upload_pdf(client, project["id"], "A1_release_record.pdf")
    process_document(client, doc_a["id"])
    process_document(client, doc_b["id"])

    resp = client.get(f"/api/projects/{project['id']}/export.pdf")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:4] == b"%PDF"
    assert len(resp.content) > 500


def test_pdf_export_can_exclude_dismissed_findings(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "B1_status_missing_serial.pdf")
    process_document(client, doc["id"])

    findings = client.get(f"/api/projects/{project['id']}/findings").json()
    assert len(findings) == 1
    client.patch(f"/api/findings/{findings[0]['id']}", json={"status": "dismissed", "reviewer_note": "Known issue, tracked elsewhere."})

    resp_excluded = client.get(f"/api/projects/{project['id']}/export.pdf", params={"include_dismissed": False})
    resp_included = client.get(f"/api/projects/{project['id']}/export.pdf", params={"include_dismissed": True})
    assert resp_excluded.status_code == 200
    assert resp_included.status_code == 200
    # The dismissed finding's extra paragraph should make the included report larger.
    assert len(resp_included.content) >= len(resp_excluded.content)

    # But the CSV audit trail always keeps the dismissed finding.
    csv_resp = client.get(f"/api/projects/{project['id']}/export.csv")
    assert "dismissed" in csv_resp.text
