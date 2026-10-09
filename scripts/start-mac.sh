#!/usr/bin/env bash
# Starts the Aviation Records Workspace MVP locally on macOS (or any
# Unix-like system with python3 + node installed). Runs the FastAPI
# backend and the Vite dev server together; Ctrl+C stops both.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

command -v python3 >/dev/null 2>&1 || { echo "python3 is required but was not found on PATH." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node is required but was not found on PATH." >&2; exit 1; }

echo "== Backend setup =="
cd "$BACKEND_DIR"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt

if [ ! -f "fixtures/demo_fixtures.json" ]; then
  echo "Generating synthetic demo fixtures..."
  python fixtures/generate_fixtures.py
fi

if [ -f ".env" ]; then
  echo "backend/.env found - live mode will be available if ANTHROPIC_API_KEY is set there."
else
  echo "No backend/.env found - running in demo mode only. Copy .env.example to backend/.env to enable live mode."
fi

echo "== Frontend setup =="
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
  npm install
fi

cleanup() {
  echo ""
  echo "Stopping backend (pid $BACKEND_PID)..."
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "== Starting backend on http://127.0.0.1:8000 =="
cd "$BACKEND_DIR"
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

sleep 1

echo "== Starting frontend on http://127.0.0.1:5173 =="
cd "$FRONTEND_DIR"
npm run dev
