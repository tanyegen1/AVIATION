from tests.conftest import process_document, upload_pdf


def _create_project(client, name="Summary Project"):
    return client.post("/api/projects", json={"name": name}).json()


def test_summary_counts_reflect_records(client):
    project = _create_project(client)
    a = upload_pdf(client, project["id"], "D1_status_sheet.pdf")
    b = upload_pdf(client, project["id"], "D1_release_record.pdf")
    missing = upload_pdf(client, project["id"], "B1_status_missing_serial.pdf")
    failing = upload_pdf(client, project["id"], "H1_processing_failure.pdf")
    upload_pdf(client, project["id"], "D1_status_sheet.pdf")  # duplicate
    for doc in (a, b, missing, failing):
        process_document(client, doc["id"])

    s = client.get(f"/api/projects/{project['id']}/summary").json()
    assert s["documents"] == {
        "total": 5,
        "processed": 3,
        "failed": 1,
        "active": 0,
        "duplicate": 1,
        "unprocessed": 0,
    }
    assert s["fields"]["total"] > 0
    assert s["fields"]["reviewed"] == 0
    # D1 pair suggested (not auto-confirmed); B1 missing serial -> one open finding
    assert s["matches"] == {"suggested": 1, "confirmed": 0, "rejected": 0}
    assert s["findings"]["open"] == 1
    assert s["findings"]["open_by_severity"] == {"missing_identifier": 1}

    # Reviewing a field moves the reviewed count.
    fields = client.get(f"/api/documents/{a['id']}/fields").json()
    client.patch(f"/api/fields/{fields[0]['id']}/confirm")
    s = client.get(f"/api/projects/{project['id']}/summary").json()
    assert s["fields"]["reviewed"] == 1


def test_document_list_includes_latest_job_progress(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "A1_status_sheet.pdf")

    listed = client.get(f"/api/projects/{project['id']}/documents").json()
    assert listed[0]["latest_job"] is None

    process_document(client, doc["id"])
    listed = client.get(f"/api/projects/{project['id']}/documents").json()
    job = listed[0]["latest_job"]
    assert job["status"] == "completed"
    assert job["pages_processed"] == 1
    assert client.get(f"/api/documents/{doc['id']}").json()["latest_job"]["id"] == job["id"]


def test_finding_evidence_points_at_the_cited_field(client):
    project = _create_project(client)
    a = upload_pdf(client, project["id"], "D1_status_sheet.pdf")
    b = upload_pdf(client, project["id"], "D1_release_record.pdf")
    process_document(client, a["id"])
    process_document(client, b["id"])
    match = client.get(f"/api/projects/{project['id']}/matches").json()[0]
    client.patch(f"/api/matches/{match['id']}", json={"status": "confirmed"})

    finding = client.get(
        f"/api/projects/{project['id']}/findings", params={"rule_id": "decreasing_flight_hours"}
    ).json()[0]
    for ev in finding["evidence"]:
        fields = client.get(f"/api/documents/{ev['document_id']}/fields").json()
        cited = next(f for f in fields if f["id"] == ev["field_id"])
        assert cited["page_number"] == ev["page_number"]
        assert cited["field_name"] == "flight_hours"
