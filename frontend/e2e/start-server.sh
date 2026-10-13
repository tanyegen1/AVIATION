#!/usr/bin/env sh
# Starts the real backend (serving the built frontend) on a throwaway
# database and storage folder for the Playwright suite. Never points at
# the developer's own data.
set -e
cd "$(dirname "$0")/../../backend"

PYTHON="${E2E_PYTHON:-.venv/bin/python}"
if [ ! -x "$PYTHON" ]; then
  echo "Backend virtualenv not found ($PYTHON). Run ./scripts/start-mac.sh once, or set E2E_PYTHON." >&2
  exit 1
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/recordbridge-e2e.XXXXXX")"
export DB_PATH="$TMP/e2e.db"
export STORAGE_DIR="$TMP/storage"
export ANTHROPIC_API_KEY=""            # demo mode only
export ADMIN_PASSWORD="e2e-test-password"  # test-only value, exercises the login gate
export SESSION_SECRET="e2e-session-secret"

exec "$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port "${E2E_PORT:-8765}"
