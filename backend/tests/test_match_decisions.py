from tests.conftest import process_document, upload_pdf


def _confirmed_d1_pair(client):
    project = client.post("/api/projects", json={"name": "Matches"}).json()
    a = upload_pdf(client, project["id"], "D1_status_sheet.pdf")
    b = upload_pdf(client, project["id"], "D1_release_record.pdf")
    process_document(client, a["id"])
    process_document(client, b["id"])
    match = client.get(f"/api/projects/{project['id']}/matches").json()[0]
    client.patch(f"/api/matches/{match['id']}", json={"status": "confirmed"})
    findings = client.get(f"/api/projects/{project['id']}/findings").json()
    assert findings, "confirming the D1 pair should produce a cross-record finding"
    return project, match, findings


def test_rejecting_a_confirmed_match_marks_its_findings_stale(client):
    project, match, findings = _confirmed_d1_pair(client)
    r = client.patch(f"/api/matches/{match['id']}", json={"status": "rejected"})
    assert r.status_code == 200
    after = {f["id"]: f for f in client.get(f"/api/projects/{project['id']}/findings").json()}
    for f in findings:
        assert after[f["id"]]["stale"] is True


def test_match_decision_can_be_undone_back_to_suggested(client):
    project, match, findings = _confirmed_d1_pair(client)
    r = client.patch(f"/api/matches/{match['id']}", json={"status": "suggested"})
    assert r.status_code == 200
    assert r.json()["status"] == "suggested"
    assert r.json()["reviewed_at"] is None
    after = {f["id"]: f for f in client.get(f"/api/projects/{project['id']}/findings").json()}
    for f in findings:
        assert after[f["id"]]["stale"] is True
    # Confirming again makes the same finding current again (no duplicate).
    client.patch(f"/api/matches/{match['id']}", json={"status": "confirmed"})
    again = client.get(f"/api/projects/{project['id']}/findings").json()
    assert len(again) == len(findings)
    assert all(not f["stale"] for f in again)
