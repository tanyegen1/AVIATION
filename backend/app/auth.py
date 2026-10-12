"""Single shared-password gate for deployments reachable beyond localhost.

This is intentionally NOT a multi-user auth system: one admin password,
one session cookie, no per-user accounts or audit trail. When
ADMIN_PASSWORD is unset (the local-dev default), every request is treated
as authenticated so the demo workflow needs no extra steps. Once
ADMIN_PASSWORD is set, every protected route requires a valid session.
"""
from __future__ import annotations

import hmac
import time
from collections import defaultdict

from fastapi import HTTPException, Request

from app.config import ADMIN_PASSWORD, auth_enabled

_SESSION_KEY = "authenticated"

# Basic brute-force throttling: a small in-memory counter per client IP.
# This is a single-process local/small-deployment app (spec section 2) -
# no shared cache needed. Resets on restart, which is acceptable here.
_FAILED_ATTEMPTS: dict[str, list[float]] = defaultdict(list)
_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 300


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def is_rate_limited(request: Request) -> bool:
    key = _client_key(request)
    now = time.monotonic()
    _FAILED_ATTEMPTS[key] = [t for t in _FAILED_ATTEMPTS[key] if now - t < _WINDOW_SECONDS]
    return len(_FAILED_ATTEMPTS[key]) >= _MAX_ATTEMPTS


def record_failed_attempt(request: Request) -> None:
    _FAILED_ATTEMPTS[_client_key(request)].append(time.monotonic())


def clear_failed_attempts(request: Request) -> None:
    _FAILED_ATTEMPTS.pop(_client_key(request), None)


def check_password(submitted: str) -> bool:
    if not ADMIN_PASSWORD:
        return False
    # Constant-time comparison - this gate is reachable from the public
    # internet once deployed, so a timing side-channel is a real risk.
    return hmac.compare_digest(submitted, ADMIN_PASSWORD)


def log_in(request: Request) -> None:
    request.session[_SESSION_KEY] = True


def log_out(request: Request) -> None:
    request.session.pop(_SESSION_KEY, None)


def is_authenticated(request: Request) -> bool:
    if not auth_enabled():
        return True
    return bool(request.session.get(_SESSION_KEY))


def require_session(request: Request) -> None:
    if not is_authenticated(request):
        raise HTTPException(status_code=401, detail="Login required.")
