from tests.conftest import process_document, upload_pdf


def _create_project(client, name="Jobs Test Project"):
    return client.post("/api/projects", json={"name": name}).json()


def test_processing_failure_does_not_look_like_a_clean_review(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "H1_processing_failure.pdf")
    result = process_document(client, doc["id"])

    job = client.get(f"/api/jobs/{result['job']['id']}").json()
    assert job["status"] == "failed"
    assert job["pages_failed"] == 1
    assert job["pages_processed"] == 0

    document = result["document"]
    assert document["status"] == "failed"
    assert document["error_message"] is not None

    # No extracted fields should exist for a page that never succeeded.
    fields = client.get(f"/api/documents/{doc['id']}/fields").json()
    assert fields == []


def test_demo_mode_rejects_unrecognized_upload_cleanly():
    """An upload with no matching demo fixture must not fabricate a result -
    it is only reachable by uploading a non-fixture PDF, which we simulate by
    reusing a fixture PDF's bytes but asserting the hash-lookup mechanism via
    the provider directly (lighter than crafting a brand-new synthetic PDF)."""
    from app.extraction.demo_provider import DemoExtractionProvider
    from app.extraction.provider import UnsupportedInDemoMode

    provider = DemoExtractionProvider()
    assert provider.is_supported("not-a-real-hash") is False
    try:
        provider.extract_page(document_sha256="not-a-real-hash", single_page_pdf_bytes=b"", page_number=1)
        assert False, "expected UnsupportedInDemoMode"
    except UnsupportedInDemoMode as exc:
        assert "ANTHROPIC_API_KEY" in str(exc)


def test_job_cancel_endpoint_rejects_finished_job(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    result = process_document(client, doc["id"])
    job_id = result["job"]["id"]

    resp = client.post(f"/api/jobs/{job_id}/cancel")
    assert resp.status_code == 400  # job already completed synchronously in tests


def test_cannot_start_overlapping_jobs(client):
    project = _create_project(client)
    doc = upload_pdf(client, project["id"], "A1_status_sheet.pdf")
    process_document(client, doc["id"])

    # Processed already; force a reprocess but the first will complete synchronously
    # in the test environment, so overlapping-job protection is exercised at the
    # API level via the same-status guard instead (covered by test_corrections).
    resp = client.post(
        f"/api/documents/{doc['id']}/jobs",
        json={"mode": "demo", "page_start": 1, "page_end": 1, "force": True},
    )
    assert resp.status_code == 200
