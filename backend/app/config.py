"""Server-side configuration, read from environment variables only.

Secrets (API keys) never leave this module's boundary into logs or
responses. See .env.example for the full list of supported variables.
"""
from __future__ import annotations

import os
import secrets
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

# Single shared-password gate (spec section 11 notes this app ships with no
# auth; this is an explicit opt-in for anyone who deploys it beyond
# localhost). Unset means auth is disabled - fine for local dev, never for
# a publicly reachable deployment. This is NOT per-user accounts, tenant
# isolation, or an audit trail of who logged in - see README "Known
# limitations" before relying on it for anything beyond keeping casual
# visitors out of a single-reviewer deployment.
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "").strip()

# Signs the session cookie. If unset, a random key is generated per process
# start (sessions won't survive a restart, but nothing is insecure about
# it). Set SESSION_SECRET explicitly in any deployment with more than one
# worker process, or sessions won't be portable across workers.
SESSION_SECRET = os.environ.get("SESSION_SECRET", "").strip() or secrets.token_hex(32)

# Whether the session cookie requires HTTPS. Defaults to "on" unless the
# server is bound to loopback (local dev over plain http), so a real
# deployment behind a public domain is secure-by-default; override
# explicitly with COOKIE_SECURE=true/false if a reverse proxy terminates
# TLS in front of this process.
_cookie_secure_env = os.environ.get("COOKIE_SECURE", "").strip().lower()
if _cookie_secure_env in ("true", "1", "yes"):
    COOKIE_SECURE = True
elif _cookie_secure_env in ("false", "0", "no"):
    COOKIE_SECURE = False
else:
    COOKIE_SECURE = HOST not in ("127.0.0.1", "localhost")


def live_mode_available() -> bool:
    return bool(ANTHROPIC_API_KEY)


def auth_enabled() -> bool:
    return bool(ADMIN_PASSWORD)
