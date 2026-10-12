# Test Results

Last run: 2026-10-12, in this repository's dev container (demo mode only -
no `ANTHROPIC_API_KEY` was available in this environment).

## 1. Backend test suite (pytest)

```
cd backend && source .venv/bin/activate && python -m pytest -v
```

**Result: 28 passed, 0 failed.**

```
tests/test_auth.py::test_status_reports_auth_enabled PASSED
tests/test_auth.py::test_protected_routes_require_login_once_enabled PASSED
tests/test_auth.py::test_login_rate_limited_after_repeated_failures PASSED
tests/test_auth.py::test_document_file_download_requires_auth PASSED
tests/test_corrections.py::test_correction_preserves_original_value PASSED
tests/test_corrections.py::test_confirm_field PASSED
tests/test_corrections.py::test_flag_unreadable_counts_as_missing_for_rules PASSED
tests/test_corrections.py::test_reprocessing_requires_explicit_force PASSED
tests/test_corrections.py::test_correction_marks_dependent_finding_stale PASSED
tests/test_duplicate.py::test_duplicate_within_project_is_flagged PASSED
tests/test_duplicate.py::test_same_file_in_different_projects_is_not_a_duplicate PASSED
tests/test_duplicate.py::test_duplicate_document_cannot_be_processed PASSED
tests/test_export.py::test_csv_export_contains_disclaimer_and_sections PASSED
tests/test_export.py::test_pdf_export_builds_valid_pdf_with_no_findings PASSED
tests/test_export.py::test_pdf_export_can_exclude_dismissed_findings PASSED
tests/test_jobs.py::test_processing_failure_does_not_look_like_a_clean_review PASSED
tests/test_jobs.py::test_demo_mode_rejects_unrecognized_upload_cleanly PASSED
tests/test_jobs.py::test_job_cancel_endpoint_rejects_finished_job PASSED
tests/test_jobs.py::test_cannot_start_overlapping_jobs PASSED
tests/test_project_deletion.py::test_deleting_project_removes_uploaded_files PASSED
tests/test_rules.py::test_consistent_pair_produces_no_findings PASSED
tests/test_rules.py::test_missing_required_identifier_flagged PASSED
tests/test_rules.py::test_distinct_components_are_not_merged PASSED
tests/test_rules.py::test_decreasing_usage_same_basis_is_flagged_after_confirmation PASSED
tests/test_rules.py::test_different_usage_basis_does_not_false_flag PASSED
tests/test_rules.py::test_unreadable_field_is_null_not_guessed PASSED
tests/test_rules.py::test_expected_document_missing_only_when_required PASSED
tests/test_rules.py::test_no_findings_message_is_not_a_compliance_claim PASSED

28 passed, 239 warnings in 3.22s
```

(Warnings are all `datetime.utcnow()` deprecation notices from SQLAlchemy's
column defaults on Python 3.13 — cosmetic, not failures.)

### What's covered

- **Access gate** (`ADMIN_PASSWORD` set): `/api/status` reports whether the
  gate is on; every protected route returns `401` until a session logs in;
  a wrong password never grants access; repeated failures (5 in the
  tracked window) are rate-limited with `429`, blocking even the correct
  password until the window clears; logging out immediately re-blocks
  protected routes; file downloads are covered by the same gate as every
  other route. With `ADMIN_PASSWORD` unset (the local-dev default used by
  every other test below), the gate is a no-op by design.
- **Rules engine**: consistent record pair → no findings; missing required
  identifier → flagged; two distinct components → never auto-merged;
  decreasing flight-hours with the *same* usage basis → flagged only after
  the reviewer confirms the component match (not before); *different*
  usage bases (since_new vs since_overhaul) → never a false discrepancy;
  an illegible non-required field → stored as `null`, never guessed, and
  does not itself trigger a missing-identifier finding; expected-document
  check → silent unless the project explicitly requires it, then fires.
- **Duplicate detection**: same file hash within one project → second
  upload flagged `duplicate` and blocked from processing; same file in two
  different projects → not a duplicate.
- **Reviewer workflow**: correcting a field preserves the original
  AI-extracted value and returns the corrected value as the "effective"
  one; confirming a field; flagging a field unreadable makes it count as
  **missing** for the required-identifier check; reprocessing an already-processed
  document is rejected unless `force=true`; correcting a field that a
  finding cited marks that finding for re-review rather than silently
  keeping it as-is.
- **Processing failures**: a page whose extraction fails (simulated via a
  demo fixture) results in a `failed` job and a `failed` document status —
  it never reports as a clean, successful review.
- **Exports**: CSV contains the required sections (documents, jobs, checks
  performed/skipped, full finding audit trail including dismissed) and the
  non-certification notice; PDF export builds a valid PDF file and
  respects `include_dismissed`.

### Not covered by automated tests

- The live Anthropic provider (`anthropic_provider.py`) — no API key was
  available in this environment. Covered instead by: (a) the shared
  Pydantic schema (`PageExtractionResult`) that both providers must
  satisfy, validated in the fixture-generation script; (b) manual code
  review against the documented `client.messages.parse(..., output_format=...)`
  structured-output contract. **This is the one part of the system that
  has not been exercised end-to-end.**
- Frontend has no automated test suite (no Jest/Vitest/Playwright test
  files were written) — verified manually instead, see below.

## 2. End-to-end manual run (demo mode)

Run via Playwright driving a real Chromium browser against the actual dev
servers (`uvicorn` on :8000, `vite` on :5173) — not mocked.

Steps performed and observed outcome:

1. **Create project** ("E2E Demo Project") → succeeded, redirected to the
   project overview.
2. **Upload 6 fixture PDFs** (`A1_status_sheet.pdf`, `A1_release_record.pdf`,
   `B1_status_missing_serial.pdf`, `D1_status_sheet.pdf`,
   `D1_release_record.pdf`, `H1_processing_failure.pdf`) → all 6 accepted
   and listed.
3. **Process each document in demo mode** → 5 completed (`processed`), 1
   (`H1_processing_failure.pdf`, which has a fixture-simulated extraction
   error) correctly ended as `failed` with 0 pages processed, 1 page
   failed — confirming a processing failure never displays as a clean
   successful review.
4. **Open `A1_status_sheet.pdf`** in the side-by-side viewer → the
   rendered PDF (with its red "SYNTHETIC DEMO DOCUMENT" banner) appeared
   next to 9 extracted fields, each showing its evidence excerpt and a
   "Text verified" evidence badge (digital-text cross-check succeeded).
5. **Correct a field** (`part_number` → `PN-1000-A-CONFIRMED`, with a
   reviewer note) → saved; the UI then showed the corrected value as
   effective while still labeling the original AI value underneath.
6. **Findings screen**: the suggested `D1_status_sheet.pdf ↔
   D1_release_record.pdf` component match appeared pending confirmation;
   confirming the first suggested match (A1 pair) worked immediately; the
   `Missing required identifiers (B1_status_missing_serial.pdf)` finding
   appeared as expected.
7. **Finding detail**: opened the missing-identifier finding, added a
   reviewer note, clicked **Confirm finding** → status changed to
   `confirmed` and the note + timestamp persisted.
8. **Export screen**: downloaded both exports directly from the running
   server —
   - `export.pdf` → valid 2-page PDF with Document Scope, Pages
     Processed/Failed (showing the H1 failure plainly), Checks
     Performed/Skipped, Findings (with the confirmed finding and the
     reviewer note), and Unresolved Uncertainties.
   - `export.csv` → valid CSV with the same sections plus the full finding
     audit history.
9. **Project overview (final state)**: stats correctly read 6 documents /
   5 processed / 1 failed / 0 open findings (since the one finding was
   confirmed, not left open) / 0 stale.

Screenshots from this run are available in this session's working
materials; they are not committed to the repository (they're a point-in-time
verification artifact, not part of the product).

## 3. Access gate manual run (landing page + login)

Run with `ADMIN_PASSWORD` set on the backend, via Playwright against the
real dev servers:

1. **Landing page** (`/`) loads with no authentication required.
2. **Direct navigation to `/projects`** while logged out → redirected to
   `/login`.
3. **Wrong password** → "Incorrect password." shown, still redirected to
   login, no access granted.
4. **Correct password** → logged in, redirected to `/projects`, the app
   loads normally.
5. **Page reload** → session persists (cookie-based), no re-login needed.
6. **Log out** (button in the top nav) → redirected to `/login`.
7. **Direct navigation to `/projects` after logout** → blocked again,
   redirected to `/login`.

All 7 steps behaved as expected.

## 4. Live mode

**Not tested against the real Anthropic API** — no `ANTHROPIC_API_KEY` was
available in this environment. See README section 4 for exactly what to do
to test it yourself, and CLAUDE.md for the contract the live provider must
keep (structured output validated against the same schema as the demo
provider, PDF sent as an untrusted `document` content block, no silent
fallback to simulated results on failure).
