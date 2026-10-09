"""End-to-end rules-engine tests driven through the real API, using the
bundled synthetic fixtures. These exercise upload -> process (demo mode)
-> component matching -> discrepancy checks -> findings, matching the
scenarios required by spec section 10.
"""
from tests.conftest import process_document, upload_pdf


def _create_project(client, name="Rules Test Project", **extra):
    resp = client.post("/api/projects", json={"name": name, **extra})
    assert resp.status_code == 200
    return resp.json()


def _confirm_all_suggested_matches(client, project_id):
    matches = client.get(f"/api/projects/{project_id}/matches").json()
    for m in matches:
        if m["status"] == "suggested":
            r = client.patch(f"/api/matches/{m['id']}", json={"status": "confirmed"})
            assert r.status_code == 200


def test_consistent_pair_produces_no_findings(client):
    project = _create_project(client)
    doc_a = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    doc_b = upload_pdf(client, project["id"], "A1_release_record.pdf")
    process_document(client, doc_a["id"])
    process_document(client, doc_b["id"])
    _confirm_all_suggested_matches(client, project["id"])

    findings = client.get(f"/api/projects/{project['id']}/findings").json()
    # The consistent pair alone must not generate any discrepancy/needs_review finding.
    relevant = [
        f for f in findings if doc_a["id"] in f["affected_document_ids"] or doc_b["id"] in f["affected_document_ids"]
    ]
    assert relevant == [], f"Expected no findings for the consistent pair, got: {relevant}"


def test_missing_required_identifier_flagged(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "B1_status_missing_serial.pdf")
    process_document(client, doc["id"])

    findings = client.get(
        f"/api/projects/{project['id']}/findings", params={"rule_id": "required_identifiers_missing"}
    ).json()
    assert len(findings) == 1
    assert findings[0]["severity"] == "missing_identifier"
    assert doc["id"] in findings[0]["affected_document_ids"]


def test_distinct_components_are_not_merged(client):
    project = _create_project(client)
    doc_a = upload_pdf(client, project["id"], "C1_status_component_one.pdf")
    doc_b = upload_pdf(client, project["id"], "C2_status_component_two.pdf")
    process_document(client, doc_a["id"])
    process_document(client, doc_b["id"])

    matches = client.get(f"/api/projects/{project['id']}/matches").json()
    pair = [
        m
        for m in matches
        if {m["document_id_a"], m["document_id_b"]} == {doc_a["id"], doc_b["id"]}
    ]
    assert pair == [], "Two documents with different part numbers must never be suggested as a match."


def test_decreasing_usage_same_basis_is_flagged_after_confirmation(client):
    project = _create_project(client)
    doc_a = upload_pdf(client, project["id"], "D1_status_sheet.pdf")
    doc_b = upload_pdf(client, project["id"], "D1_release_record.pdf")
    process_document(client, doc_a["id"])
    process_document(client, doc_b["id"])

    # Before confirmation, no discrepancy should be raised yet (identity not confirmed).
    findings_before = client.get(
        f"/api/projects/{project['id']}/findings", params={"rule_id": "decreasing_flight_hours"}
    ).json()
    assert findings_before == []

    _confirm_all_suggested_matches(client, project["id"])

    findings_after = client.get(
        f"/api/projects/{project['id']}/findings", params={"rule_id": "decreasing_flight_hours"}
    ).json()
    assert len(findings_after) == 1
    assert findings_after[0]["severity"] == "discrepancy"
    assert set(findings_after[0]["affected_document_ids"]) == {doc_a["id"], doc_b["id"]}


def test_different_usage_basis_does_not_false_flag(client):
    project = _create_project(client)
    doc_a = upload_pdf(client, project["id"], "E1_status_sheet.pdf")
    doc_b = upload_pdf(client, project["id"], "E1_release_record.pdf")
    process_document(client, doc_a["id"])
    process_document(client, doc_b["id"])
    _confirm_all_suggested_matches(client, project["id"])

    findings = client.get(
        f"/api/projects/{project['id']}/findings", params={"rule_id": "decreasing_flight_hours"}
    ).json()
    assert findings == [], (
        "Different usage bases (since_overhaul vs since_new) must never produce a decreasing-usage finding, "
        f"got: {findings}"
    )


def test_unreadable_field_is_null_not_guessed(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "F1_status_unreadable_field.pdf")
    process_document(client, doc["id"])

    fields = client.get(f"/api/documents/{doc['id']}/fields").json()
    description_fields = [f for f in fields if f["field_name"] == "component_description"]
    assert description_fields == [], "No component_description field should exist when it was illegible on the page."

    # The document is NOT missing a required identifier (description isn't required for this category).
    findings = client.get(
        f"/api/projects/{project['id']}/findings", params={"rule_id": "required_identifiers_missing"}
    ).json()
    assert findings == []


def test_expected_document_missing_only_when_required(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "G1_status_no_release.pdf")
    process_document(client, doc["id"])

    # Not required by default - no finding.
    findings = client.get(
        f"/api/projects/{project['id']}/findings", params={"rule_id": "expected_document_missing"}
    ).json()
    assert findings == []

    # Turn the project setting on and re-run.
    r = client.patch(f"/api/projects/{project['id']}", json={"require_maintenance_release_for_status_sheets": True})
    assert r.status_code == 200
    client.post(f"/api/projects/{project['id']}/rules/run")

    findings = client.get(
        f"/api/projects/{project['id']}/findings", params={"rule_id": "expected_document_missing"}
    ).json()
    assert len(findings) == 1
    assert findings[0]["severity"] == "expected_document_missing"
    assert doc["id"] in findings[0]["affected_document_ids"]


def test_no_findings_message_is_not_a_compliance_claim(client):
    """When the selected checks produce nothing, the API must simply return an
    empty list - the UI/report layer is responsible for rendering the exact
    'No findings from the selected checks' wording, never 'compliant'."""
    project = _create_project(client)
    doc_a = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    doc_b = upload_pdf(client, project["id"], "A1_release_record.pdf")
    process_document(client, doc_a["id"])
    process_document(client, doc_b["id"])

    findings = client.get(f"/api/projects/{project['id']}/findings").json()
    assert findings == []
