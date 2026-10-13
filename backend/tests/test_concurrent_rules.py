"""Several documents can finish processing at the same moment (each job runs
in its own worker thread), so rule runs for one project can overlap. They
must not create the same match suggestion twice."""
import threading

from app.db import SessionLocal
from app.models import ComponentMatch
from app.rules.engine import run_rules_for_project
from tests.conftest import process_document, upload_pdf


def test_concurrent_rule_runs_suggest_each_match_once(client):
    project = client.post("/api/projects", json={"name": "Concurrent"}).json()
    for name in ("D1_status_sheet.pdf", "D1_release_record.pdf", "A1_status_sheet.pdf", "A1_release_record.pdf"):
        process_document(client, upload_pdf(client, project["id"], name)["id"])

    with SessionLocal() as db:
        db.query(ComponentMatch).delete()
        db.commit()

    barrier = threading.Barrier(8)
    errors: list[BaseException] = []

    def worker():
        db = SessionLocal()
        try:
            barrier.wait()
            run_rules_for_project(db, project["id"])
        except BaseException as e:  # noqa: BLE001 - surfaced via the assertion below
            errors.append(e)
        finally:
            db.close()

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == []
    matches = client.get(f"/api/projects/{project['id']}/matches").json()
    pairs = [frozenset((m["document_id_a"], m["document_id_b"])) for m in matches]
    assert len(pairs) == len(set(pairs)) == 2
