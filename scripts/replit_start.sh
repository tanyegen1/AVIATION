#!/usr/bin/env bash
# Entry point for running this app on Replit (or any other single-process
# host): builds the frontend once, then serves both the API and the built
# SPA from one FastAPI process on one port - see app/main.py's single-origin
# static serving. Set this as the Repl's Run command.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "== Installing backend dependencies =="
cd "$BACKEND_DIR"
python3 -m pip install -q -r requirements.txt

if [ ! -f "fixtures/demo_fixtures.json" ]; then
  echo "== Generating synthetic demo fixtures =="
  python3 fixtures/generate_fixtures.py
fi

echo "== Building frontend =="
cd "$FRONTEND_DIR"
npm install --no-audit --no-fund
npm run build

echo "== Starting server on 0.0.0.0:${PORT:-8000} =="
cd "$BACKEND_DIR"
exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
