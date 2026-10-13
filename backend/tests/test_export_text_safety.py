"""Exports must survive whatever text reviewers and documents contain:
markup characters in notes, and non-ASCII (e.g. Turkish) project names."""
from urllib.parse import quote

from tests.conftest import process_document, upload_pdf


def _project_with_noted_finding(client, name, note):
    project = client.post("/api/projects", json={"name": name}).json()
    doc = upload_pdf(client, project["id"], "B1_status_missing_serial.pdf")
    process_document(client, doc["id"])
    finding = client.get(f"/api/projects/{project['id']}/findings").json()[0]
    client.patch(f"/api/findings/{finding['id']}", json={"status": "confirmed", "reviewer_note": note})
    return project


def test_pdf_export_handles_markup_characters_in_reviewer_text(client):
    project = _project_with_noted_finding(client, "Fleet <A320> & co", "S/N < 5 chars & <b>unclosed")
    r = client.get(f"/api/projects/{project['id']}/export.pdf?include_dismissed=true")
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")


def test_exports_handle_non_ascii_project_names(client):
    name = "Uçak bakım şğı"
    project = _project_with_noted_finding(client, name, "kontrol edildi")
    for path, ext in (("export.pdf", "pdf"), ("export.csv", "csv")):
        r = client.get(f"/api/projects/{project['id']}/{path}")
        assert r.status_code == 200
        disposition = r.headers["content-disposition"]
        disposition.encode("latin-1")  # must be a valid header value
        assert f"filename*=UTF-8''{quote(name)}" in disposition
        assert disposition.endswith(f".{ext}")
