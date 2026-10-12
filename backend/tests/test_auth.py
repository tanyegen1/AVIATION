"""The shared-password gate only matters once ADMIN_PASSWORD is configured -
every other test in this suite runs with it unset (auth disabled, spec
section 2's local single-user default). These tests turn it on explicitly."""
import app.auth as auth_module
import app.config as config_module
from tests.conftest import upload_pdf


def _enable_auth(monkeypatch, password="test-password-123"):
    monkeypatch.setattr(config_module, "ADMIN_PASSWORD", password)
    monkeypatch.setattr(auth_module, "ADMIN_PASSWORD", password)
    auth_module._FAILED_ATTEMPTS.clear()
    return password


def test_status_reports_auth_enabled(client, monkeypatch):
    resp = client.get("/api/status")
    assert resp.json()["auth_enabled"] is False

    _enable_auth(monkeypatch)
    resp = client.get("/api/status")
    assert resp.json()["auth_enabled"] is True


def test_protected_routes_require_login_once_enabled(client, monkeypatch):
    _enable_auth(monkeypatch)

    resp = client.get("/api/projects")
    assert resp.status_code == 401

    resp = client.post("/api/auth/login", json={"password": "wrong"})
    assert resp.status_code == 401

    resp = client.get("/api/projects")
    assert resp.status_code == 401  # a failed attempt must not grant access

    resp = client.post("/api/auth/login", json={"password": "test-password-123"})
    assert resp.status_code == 200
    assert resp.json()["authenticated"] is True

    resp = client.get("/api/projects")
    assert resp.status_code == 200

    resp = client.get("/api/auth/me")
    assert resp.json()["authenticated"] is True

    resp = client.post("/api/auth/logout")
    assert resp.status_code == 200

    resp = client.get("/api/projects")
    assert resp.status_code == 401


def test_login_rate_limited_after_repeated_failures(client, monkeypatch):
    _enable_auth(monkeypatch)

    for _ in range(5):
        resp = client.post("/api/auth/login", json={"password": "wrong"})
        assert resp.status_code == 401

    resp = client.post("/api/auth/login", json={"password": "wrong"})
    assert resp.status_code == 429

    # Even the correct password is blocked while rate-limited.
    resp = client.post("/api/auth/login", json={"password": "test-password-123"})
    assert resp.status_code == 429


def test_document_file_download_requires_auth(client, monkeypatch):
    resp = client.post("/api/projects", json={"name": "Auth Test Project"})
    project = resp.json()
    doc = upload_pdf(client, project["id"], "A1_status_sheet.pdf")

    _enable_auth(monkeypatch)
    client.post("/api/auth/logout")  # ensure we start logged out under the new password

    resp = client.get(f"/api/documents/{doc['id']}/file")
    assert resp.status_code == 401

    client.post("/api/auth/login", json={"password": "test-password-123"})
    resp = client.get(f"/api/documents/{doc['id']}/file")
    assert resp.status_code == 200
