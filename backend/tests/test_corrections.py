from tests.conftest import process_document, upload_pdf


def _create_project(client, name="Correction Test Project", **extra):
    return client.post("/api/projects", json={"name": name, **extra}).json()


def test_correction_preserves_original_value(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    process_document(client, doc["id"])

    fields = client.get(f"/api/documents/{doc['id']}/fields").json()
    part_number_field = next(f for f in fields if f["field_name"] == "part_number")
    assert part_number_field["raw_value"] == "PN-1000-A"
    assert part_number_field["review_status"] == "unreviewed"

    resp = client.patch(
        f"/api/fields/{part_number_field['id']}/correct",
        json={"corrected_value": "PN-1000-A-REV2", "corrected_note": "Reviewer verified against physical tag."},
    )
    assert resp.status_code == 200
    corrected = resp.json()

    assert corrected["raw_value"] == "PN-1000-A"  # original value is never overwritten
    assert corrected["corrected_value"] == "PN-1000-A-REV2"
    assert corrected["effective_value"] == "PN-1000-A-REV2"
    assert corrected["review_status"] == "corrected"
    assert corrected["corrected_at"] is not None


def test_confirm_field(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    process_document(client, doc["id"])
    fields = client.get(f"/api/documents/{doc['id']}/fields").json()
    f = fields[0]

    resp = client.patch(f"/api/fields/{f['id']}/confirm")
    assert resp.status_code == 200
    assert resp.json()["review_status"] == "confirmed"


def test_flag_unreadable_counts_as_missing_for_rules(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    process_document(client, doc["id"])
    fields = client.get(f"/api/documents/{doc['id']}/fields").json()
    serial_field = next(f for f in fields if f["field_name"] == "serial_number")

    # Before flagging: no missing-identifier finding (serial_number was read successfully).
    findings = client.get(
        f"/api/projects/{project['id']}/findings", params={"rule_id": "required_identifiers_missing"}
    ).json()
    assert findings == []

    resp = client.patch(
        f"/api/fields/{serial_field['id']}/flag-unreadable",
        json={"corrected_note": "Cannot confirm against the scan - tag is obscured."},
    )
    assert resp.status_code == 200
    assert resp.json()["review_status"] == "flagged_unreadable"

    findings = client.get(
        f"/api/projects/{project['id']}/findings", params={"rule_id": "required_identifiers_missing"}
    ).json()
    assert len(findings) == 1
    assert doc["id"] in findings[0]["affected_document_ids"]


def test_reprocessing_requires_explicit_force(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    process_document(client, doc["id"])

    resp = client.post(
        f"/api/documents/{doc['id']}/jobs",
        json={"mode": "demo", "page_start": 1, "page_end": 1, "force": False},
    )
    assert resp.status_code == 409

    resp_forced = client.post(
        f"/api/documents/{doc['id']}/jobs",
        json={"mode": "demo", "page_start": 1, "page_end": 1, "force": True},
    )
    assert resp_forced.status_code == 200


def test_correction_marks_dependent_finding_stale(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "B1_status_missing_serial.pdf")
    process_document(client, doc["id"])

    findings = client.get(
        f"/api/projects/{project['id']}/findings", params={"rule_id": "required_identifiers_missing"}
    ).json()
    assert len(findings) == 1

    fields = client.get(f"/api/documents/{doc['id']}/fields").json()
    part_number_field = next(f for f in fields if f["field_name"] == "part_number")

    # Correcting an unrelated field used by the finding should mark it stale,
    # not silently keep the old conclusion.
    client.patch(
        f"/api/fields/{part_number_field['id']}/correct",
        json={"corrected_value": "PN-2000-B-FIXED"},
    )

    findings_after = client.get(f"/api/projects/{project['id']}/findings").json()
    matching = [f for f in findings_after if f["id"] == findings[0]["id"]]
    assert len(matching) == 1
