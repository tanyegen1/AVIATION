# RecordBridge (Aviation Records Workspace MVP)

*"Aviation Records Workspace" is the working/technical name used throughout
this codebase and documentation; "RecordBridge" is the public-facing brand
shown on the landing page and in exports.*

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

Both bind to `127.0.0.1` only by default (spec section 11). See section 4.5
below before exposing this to anything beyond your own machine.

## 4. Enabling live processing

1. Get an Anthropic API key from https://console.anthropic.com/.
2. Copy the example env file and fill it in:
   ```bash
   cp .env.example backend/.env
   # edit backend/.env and set ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Restart the backend. The mode indicator in the top bar will switch to
   "Live mode ready". `ANTHROPIC_MODEL` defaults to `claude-opus-5-5` and
   `ANTHROPIC_EFFORT` to `medium` if not set. Each page is one structured-
   output request; if the model declines a page on safety grounds the API's
   server-side fallback retries it on a substitute model, and the job records
   which model actually answered. Anything that still fails (a decline, a
   cut-off response, an invalid result) marks that page failed with the
   reason - never a guessed value.
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

## 4.5. Deploying beyond localhost (e.g. a real domain)

This app ships with **no authentication by default** — it assumes a single
trusted user on their own machine (spec section 2/11). If you deploy it
somewhere reachable over the internet (a VPS, a managed host, behind your
own domain), you must do both of these first:

**A. Turn on the access gate.** Set `ADMIN_PASSWORD` (and ideally
`SESSION_SECRET`, so sessions survive a restart) as real environment
variables on the server — never commit them, never put them in `backend/.env`
if that file could end up in a shared image. Once set, every screen and API
route requires that password via a login page before anything else loads.
This is **one shared password for the whole app**, not per-user accounts —
good enough to keep casual visitors out of a single-reviewer deployment, not
a substitute for real multi-tenant authentication (see Known limitations).

**B. Run it as a single containerized process.** The root `Dockerfile` is a
multi-stage build: it compiles the frontend, then runs the backend, which
serves the built frontend (`frontend/dist/`) directly - API and UI share
one port and one origin, so there's no separate static host and no CORS
configuration to manage. This one image is portable to any Docker-capable
host; `render.yaml` wires it up for **Render** specifically, chosen because
its free tier needs no credit card and "connect a GitHub repo, click
deploy" is close to zero-setup.

### Deploying on Render with a custom domain

1. Push this repo to GitHub if it isn't already (it's already on
   `tanyegen1/AVIATION`).
2. Sign up at **render.com** (GitHub login is the fastest option).
3. **New → Blueprint**, pick this repo/branch. Render reads `render.yaml`
   automatically and sets everything up from it.
4. It will ask you to fill in two secret values before deploying:
   - `ADMIN_PASSWORD` — the access-gate password (see part A above)
   - `ANTHROPIC_API_KEY` — only if you want live mode (leave blank for demo mode)
   (`SESSION_SECRET` is generated for you automatically.)
5. Click **Apply** / **Create Web Service**. First build takes a few
   minutes (compiling the frontend + installing dependencies inside the
   container). When it's done you'll have a working `https://recordbridge.onrender.com`-style
   URL you can open immediately to confirm it works.
6. In the service's **Settings → Custom Domain**, add `recordbridge.ai`
   (and `www.recordbridge.ai` if you want that too). Render will show you
   the **exact DNS record to add** (a CNAME, generated per-deployment —
   copy it exactly as shown).
7. In GoDaddy, open your domain's **DNS Management** page (not the
   separate "DNS Hosting" product — that's a different, unrelated tool)
   and add that exact CNAME record. DNS changes can take anywhere from a
   few minutes to a few hours to propagate; Render auto-issues an HTTPS
   certificate once it sees the DNS pointing at it.

**Persistence note:** Render's free plan has no persistent disk, so
uploaded PDFs and the SQLite database reset on every redeploy/restart —
fine for trying it out, not for real use. `render.yaml` has a commented-out
`disk:` block; uncomment it and bump `plan` to `starter` (~$7/month) once
you're ready to keep real data permanently. This isn't something I can
turn on for you from here — it's a paid-plan change on your Render
account, your call on when/whether to spend that.

### Other hosting options

The same `Dockerfile` runs identically on Railway, Fly.io, a plain VPS
with Docker installed, or anywhere else that runs containers — `render.yaml`
is Render-specific wiring, but the image itself isn't locked to Render.
For a VPS, add an **A record** in GoDaddy pointing at the server's IP; for
another PaaS, add the **CNAME it gives you**, same as step 6 above.

## 5. Running tests

```bash
cd backend
source .venv/bin/activate
python -m pytest -q
```

The backend suite covers the rules engine (consistent pairs, missing
identifiers, distinct-component non-merging, decreasing-usage
discrepancies, the different-usage-basis non-false-positive, unreadable
fields, expected-document-missing), duplicate detection and document
deletion, the correction/confirm/flag-unreadable workflow (corrections
mark dependent findings stale), reprocessing ("current fields"), match
decisions and undo, concurrent rule runs, processing failures (a failed
page must never look like a clean review), both export formats including
markup characters and non-ASCII names, and the access gate.

### End-to-end browser tests

`frontend/e2e/` holds a Playwright suite that drives the real backend
(demo mode, a throwaway database, a test-only password) serving the built
frontend:

```bash
cd frontend
npx playwright install chromium   # first time on a machine only
npm run build
npm run test:e2e
```

It covers the login gate, upload → process → keyboard review, matches and
findings decisions, evidence deep links, the report preview, a check that
a clean project never claims compliance, an automated WCAG 2 A/AA scan
(axe-core) of every screen, keyboard focus behaviour (skip link, dialog
focus trap and return), and a 390px phone-width layout check. Results of
the latest run are in [TEST_RESULTS.md](TEST_RESULTS.md).

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
    routers/                 projects / documents / processing / export / auth endpoints
    auth.py                   shared-password session gate (opt-in, see section 4.5)
    serializers.py            ORM -> JSON dict helpers
  fixtures/                synthetic demo PDFs + generator script + expected results
  tests/                     pytest suite
frontend/
  src/
    pages/              the 7 required screens + Landing (public) + Login
    components/          PDF viewer, nav tabs, status/severity badges, RequireAuth
    AuthContext.tsx        session state (me/login/logout)
    api.ts / types.ts     typed API client
scripts/start-mac.sh     one-command local startup (two dev servers)
scripts/replit_start.sh   single-process production startup (Replit or any host)
CLAUDE.md                 scope, architecture and non-negotiable rules for future AI-assisted work on this repo
```

## 7. Known limitations and what is untested

- **Live mode was implemented but not exercised against the real API** in
  this environment (see section 4). The demo-mode pipeline (upload →
  process → review → correct → export) was fully tested end to end.
- **Single shared password, not real multi-user auth.** Setting
  `ADMIN_PASSWORD` (section 4.5) gates the whole app behind one login
  screen — there are still no per-user accounts, no roles, no audit trail
  of who reviewed what, and no tenant isolation. `HOST` defaults to
  `127.0.0.1`; only change it, and only set `ADMIN_PASSWORD`, when you
  intend to deploy beyond your own machine.
- **Accessibility is checked automatically, not audited.** The e2e suite
  runs axe-core (WCAG 2 A/AA) on every screen and tests keyboard focus,
  but no manual screen-reader pass has been done.
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
