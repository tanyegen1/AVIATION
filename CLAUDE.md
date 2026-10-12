# CLAUDE.md

Guidance for any future AI-assisted work on this repository. Read this
before changing extraction, rules, or review-workflow code.

## Product

**Aviation Records Workspace** (temporary name) — an AI-assisted review
workspace for aviation technical-records specialists. Users upload
maintenance-related PDFs; the system extracts structured fields, suggests
links between documents that may describe the same component, and flags
specific discrepancies for a human reviewer to confirm, correct, or
dismiss.

**It supports human review. It does not certify airworthiness, authenticate
documents, or issue regulatory compliance decisions.** Every surface
(UI, exports, API error messages) must keep that framing. Never let any
code path produce language like "compliant", "airworthy", "verified
authentic", or "certified" — the correct phrasing for a clean result is
*"No findings from the selected checks"*.

This is a **local, single-user evaluation application**. Do not add
billing, fleet forecasting, insurance workflows, a cross-customer
registry, or enterprise integrations without an explicit, separate
decision to expand scope.

## Architecture

- **Frontend:** React + TypeScript + Vite (`frontend/`). Plain fetch-based
  API client (`src/api.ts`), no state-management library. 7 screens under
  `src/pages/`.
- **Backend:** FastAPI + SQLAlchemy + SQLite (`backend/`).
  - `app/extraction/` — provider-agnostic extraction interface
    (`provider.py`), a `demo` implementation (`demo_provider.py`, fixture
    lookup by file SHA-256) and a `live` implementation
    (`anthropic_provider.py`, Anthropic Messages API structured outputs).
    **Adding a new AI vendor means writing one more class against
    `ExtractionProvider` — nothing else should import a provider module
    directly.**
  - `app/rules/` — a small, explicit, hand-written Python rules engine
    (`checks.py`, `engine.py`). **Never replace a check here with an LLM
    call that makes an open-ended judgment** (e.g. "is this compliant?").
    Rules compare already-extracted, reviewer-correctable field values.
  - `app/jobs.py` — synchronous processing job execution (batches,
    bounded retries, cancellation, recovery of interrupted jobs on
    startup). Deliberately not a distributed queue — this is a
    single-user local app.
  - `app/routers/` — REST endpoints; `app/serializers.py` — ORM → dict.
  - `app/auth.py` + `app/routers/auth.py` — an **opt-in** single
    shared-password session gate (`ADMIN_PASSWORD` env var), for deployments
    reachable beyond localhost. Disabled by default (local dev). This is
    **not** per-user accounts, roles, or tenant isolation — never describe
    it as such in UI copy or docs; it only keeps casual visitors out of a
    single-reviewer deployment.
- **Storage:** uploaded PDFs live under `backend/storage/<project_id>/`,
  outside anything served as static content. Never move this under a
  path a web server would serve directly.
- **Single-origin serving:** `app/main.py` serves `frontend/dist/` (once
  built) as a static SPA from the same FastAPI process, behind every
  `/api/*` route. This lets a single-process host (e.g. Replit, via
  `scripts/replit_start.sh`) run the whole app on one port with no CORS
  setup. Keep the catch-all route registered **last**, after every router,
  and keep its `api/` prefix guard (returns 404, not `index.html`, for
  unknown API paths) so it never shadows a real endpoint.

## Non-negotiable rules

1. **No fabricated extraction.** A field that could not be read is `null`,
   never a guessed value. Demo mode only ever returns pre-written fixture
   results for the bundled synthetic PDFs (matched by SHA-256); an
   unrecognized upload in demo mode must fail clearly, never return
   invented data. Live mode failures must surface as a clear error status,
   never a silent fallback to simulated output.
2. **No fabricated evidence.** `evidence_text` must be something the
   model actually returned, tied to a real page number. For digital text
   pages, verify the excerpt against the page's extracted text
   (`evidence_verification`); for scanned pages, label evidence as
   requiring visual verification rather than pretending it was checked.
   Never synthesize bounding boxes or highlights that don't exist.
3. **Explicit demo/live separation.** `GET /api/status` and the UI's mode
   pill must always truthfully reflect whether `ANTHROPIC_API_KEY` is
   configured. Demo-mode screens carry a visible "Demo — synthetic
   documents and simulated extraction" label. Never blur the two modes
   together in a response or a UI string.
4. **Human review for uncertainty.** Component matches are *suggested*,
   never auto-confirmed, even when part number and serial number are
   identical. Discrepancy checks that depend on chronology/usage-basis
   comparability must return nothing (not a guess, not "needs_review")
   when that comparability can't be established — see `rules/checks.py`
   for the exact preconditions. A reviewer correction must preserve the
   original AI-extracted value (`raw_value` is never overwritten;
   corrections live in separate `corrected_value`/`corrected_at`/
   `corrected_note` columns) and must mark any finding that cited the
   corrected field as `stale` for re-review, not silently keep the old
   conclusion.
5. **No compliance certification.** No code path may claim an
   airworthiness, authenticity, or regulatory conclusion. "No findings"
   always means "no findings from the selected checks", not "compliant".

## Common commands

```bash
# One-shot local start (demo mode, no credentials needed)
./scripts/start-mac.sh

# Backend only
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend only
cd frontend && npm run dev

# Regenerate synthetic demo fixtures (after editing generate_fixtures.py)
cd backend && source .venv/bin/activate
python fixtures/generate_fixtures.py

# Backend tests
cd backend && source .venv/bin/activate
python -m pytest -q

# Frontend typecheck + build
cd frontend && npm run build
```

## Extending the rules engine

Add a new check as a plain function in `app/rules/checks.py` returning a
list of `FindingDraft`, wire it into `run_rules_for_project` in
`app/rules/engine.py`, and give it a stable `dedup_key` so re-running
rules never duplicates an existing finding and never resurrects one a
reviewer already dismissed. Record every rule's id in `rule_ids_executed`
or `rule_ids_skipped` on the `RuleRun` so the export can honestly state
which checks did and didn't run.

## Extending extraction fields

The canonical field list lives in `app/extraction/schema.py`
(`FieldName` literal + `PageExtractionResult`). Changing it means updating:
the live provider's system prompt, the demo fixtures
(`backend/fixtures/demo_fixtures.json` / `generate_fixtures.py`), any
rules that reference the field name, and the frontend's field rendering
(`DocumentViewer.tsx`) — there is no central field registry beyond the
schema itself.
