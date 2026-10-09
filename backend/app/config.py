"""Server-side configuration, read from environment variables only.

Secrets (API keys) never leave this module's boundary into logs or
responses. See .env.example for the full list of supported variables.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

# Load backend/.env if present (never committed - see .env.example at repo root).
load_dotenv(BACKEND_DIR / ".env")

# Storage lives outside any directory a web server would serve statically.
STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", BACKEND_DIR / "storage")).resolve()
DB_PATH = Path(os.environ.get("DB_PATH", BACKEND_DIR / "aviation_records.db")).resolve()
FIXTURES_DIR = BACKEND_DIR / "fixtures"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5").strip()

# Conservative defaults per spec section 5. Overridable via env for testing.
MAX_UPLOAD_MB = float(os.environ.get("MAX_UPLOAD_MB", "25"))
MAX_UPLOAD_BYTES = int(MAX_UPLOAD_MB * 1024 * 1024)
MAX_PAGE_COUNT = int(os.environ.get("MAX_PAGE_COUNT", "100"))
MAX_PAGES_PER_BATCH = int(os.environ.get("MAX_PAGES_PER_BATCH", "5"))
MAX_PAGES_PER_JOB = int(os.environ.get("MAX_PAGES_PER_JOB", "20"))
JOB_MAX_RETRIES = int(os.environ.get("JOB_MAX_RETRIES", "2"))

EXTRACTION_SCHEMA_VERSION = "1.0.0"
RULES_ENGINE_VERSION = "1.0.0"

CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))


def live_mode_available() -> bool:
    return bool(ANTHROPIC_API_KEY)
