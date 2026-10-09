# Aviation Records Workspace (MVP)

*Temporary product name.*

An AI-assisted workspace for aviation technical-records specialists. Users
upload maintenance-related PDFs; the system extracts structured fields,
suggests links between documents that may describe the same component, and
flags specific discrepancies for a human reviewer to confirm, correct, or
dismiss.

**This tool supports human review. It does not certify airworthiness,
authenticate documents, or issue regulatory compliance decisions.** Every
screen and export says so explicitly.

This is a local, single-user evaluation application, not a production or
multi-tenant system. See [Known limitations](#known-limitations-and-what-is-untested).

## 1. Stack

- **Frontend:** React + TypeScript + Vite, `react-pdf` for in-browser PDF
  viewing with page navigation.
- **Backend:** Python + FastAPI, SQLAlchemy over SQLite.
- **Storage:** Uploaded PDFs are stored on the local filesystem under
  `backend/storage/`, outside anything served as static web content.
- **AI:** A small provider interface (`backend/app/extraction/provider.py`)
  with two implementations: a **demo** provider (fixture-based, no network
  calls) and a **live** provider backed by the Anthropic Messages API
  (structured outputs, PDF document input). Adding a second AI vendor later
  means writing one more class against the same interface.
- **Rules:** A small, explicit Python rules engine (`backend/app/rules/`) -
  no LLM is asked to make a compliance judgment.

## 2. Two operating modes

- **Demo mode** — works with no credentials. Uses the synthetic PDFs in
  `backend/fixtures/pdfs/` and a matching fixture file of simulated
  extraction output (`backend/fixtures/demo_fixtures.json`), looked up by
  the uploaded file's SHA-256 hash. Uploading a PDF that isn't one of the
  bundled fixtures is accepted and stored, but **processing it in demo mode
  returns a clear "live processing requires an API key" message — it is
  never silently simulated.**
- **Live mode** — calls the real Anthropic API. Requires `ANTHROPIC_API_KEY`
  (and optionally `ANTHROPIC_MODEL`) as server-side environment variables.
  If the key is missing or a call fails, the job/document status reports
  the failure plainly; the app never falls back to simulated results.

The UI shows a mode indicator at all times, and demo-mode screens carry an
explicit "Demo — synthetic documents and simulated extraction" banner.

## 3. Quick start (macOS / Linux)

```bash
./scripts/start-mac.sh
```

This script:
1. Creates a Python virtualenv under `backend/.venv` and installs pinned
   dependencies from `backend/requirements.txt`.
2. Generates the synthetic demo PDFs and fixtures if they aren't already
   present (`backend/fixtures/pdfs/`, `backend/fixtures/demo_fixtures.json`).
3. Installs frontend dependencies (`frontend/node_modules`) if needed.
4. Starts the backend at `http://127.0.0.1:8000` and the frontend dev server
   at `http://127.0.0.1:5173`.

Open **http://127.0.0.1:5173** in your browser. Everything works in demo
mode with no further setup.

### Manual setup (equivalent steps)

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python fixtures/generate_fixtures.py   # only needed once
uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Both bind to `127.0.0.1` only (spec section 11) — this app must not be
exposed on a public network interface.

## 4. Enabling live processing

1. Get an Anthropic API key from https://console.anthropic.com/.
2. Copy the example env file and fill it in:
   ```bash
   cp .env.example backend/.env
   # edit backend/.env and set ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Restart the backend. The mode indicator in the top bar will switch to
   "Live mode ready". `ANTHROPIC_MODEL` defaults to `claude-sonnet-5-5`
   (a current-generation model with native PDF document input support) if
   not set.
4. On the Documents screen, pick **Live** as the processing mode for a
   document (Demo stays selectable even with a key configured).

The backend never logs the key, never returns it in any API response, and
never asks you to paste it into chat.

**Live mode has not been exercised against the real Anthropic API in this
environment** (no key was available while building this MVP) — the
provider is fully implemented against the documented Messages API
structured-output contract (`client.messages.parse(..., output_format=...)`
with a PDF `document` content block) and exercised by an offline
unit-style check that the shared Pydantic schema validates correctly, but
an end-to-end live call has not been run. Test it yourself by setting a
real key and processing a real PDF before relying on it.

## 5. Running tests

```bash
cd backend
source .venv/bin/activate
python -m pytest -q
```

24 tests cover: the rules engine (consistent pairs, missing identifiers,
distinct-component non-merging, decreasing-usage discrepancies, the
different-usage-basis non-false-positive, unreadable fields, expected-document-missing),
duplicate detection, the correction/confirm/flag-unreadable reviewer
workflow (including that a correction marks dependent findings stale),
processing failures (a failed page must never look like a clean review),
and both export formats. All 24 currently pass locally in demo mode (see
[TEST_RESULTS.md](TEST_RESULTS.md) for the latest run's output).

There is no frontend test suite in this MVP; the UI was exercised manually
end-to-end (see TEST_RESULTS.md).

## 6. Project structure

```
backend/
  app/
    main.py            FastAPI app, CORS, startup job recovery
    config.py           env-driven configuration (STORAGE_DIR, limits, API key)
    db.py / models.py   SQLAlchemy engine + schema
    storage.py           filesystem storage for uploaded PDFs
    pdf_utils.py          PyMuPDF-backed validation, page text/image extraction
    jobs.py                processing job execution (batches, retries, cancellation)
    extraction/            provider interface + demo/live implementations + schema
    rules/                  explicit discrepancy checks + matching + engine
    routers/                 projects / documents / processing / export endpoints
    serializers.py            ORM -> JSON dict helpers
  fixtures/                synthetic demo PDFs + generator script + expected results
  tests/                     pytest suite
frontend/
  src/
    pages/              the 7 required screens
    components/          PDF viewer, nav tabs, status/severity badges
    api.ts / types.ts     typed API client
scripts/start-mac.sh     one-command local startup
CLAUDE.md                 scope, architecture and non-negotiable rules for future AI-assisted work on this repo
```

## 7. Known limitations and what is untested

- **Live mode was implemented but not exercised against the real API** in
  this environment (see section 4). The demo-mode pipeline (upload →
  process → review → correct → export) was fully tested end to end.
- **Single-user, local only.** There is no authentication, no per-user
  accounts, and no tenant isolation. `HOST` defaults to `127.0.0.1`; do not
  change this to `0.0.0.0` or deploy it on a shared network without adding
  real auth, isolation, and a security review first.
- **No frontend automated tests.** Manual verification only (see
  TEST_RESULTS.md for the exact steps run and their outcome).
- **Scanned-page evidence is not pixel-verified.** For a scanned page, the
  app labels extracted text as "requires visual verification" rather than
  attempting to prove the excerpt appears in the image (no bounding boxes
  or highlights are fabricated).
- **Rules engine scope is intentionally narrow.** It implements exactly the
  checks listed in the spec (missing/unreadable required identifiers,
  conflicting identity fields between confirmed matches, decreasing
  cumulative usage when comparable, and expected-document-missing when the
  project explicitly requires it). It does not attempt open-ended
  consistency checking or any judgment of compliance.
- **No background job queue.** Processing runs as a FastAPI background
  task within the same process — adequate for a local single-user tool,
  not for concurrent multi-user load.
- **PDF-only.** Scanned images embedded in other formats, Word documents,
  etc. are out of scope for this version, per spec.

Public deployment, multi-customer use, or anything beyond local evaluation
would require: real authentication and per-tenant isolation, a production
task queue, rate limiting, a security review of the upload and extraction
pipeline, and a legal/compliance review of the "review support, not
certification" framing for the intended market. **None of that is in this
MVP.**
