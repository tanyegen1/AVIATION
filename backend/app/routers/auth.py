from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.auth import (
    check_password,
    clear_failed_attempts,
    is_authenticated,
    is_rate_limited,
    log_in,
    log_out,
    record_failed_attempt,
)
from app.config import auth_enabled
from app.schemas import LoginRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me")
def me(request: Request):
    return {"authenticated": is_authenticated(request), "auth_enabled": auth_enabled()}


@router.post("/login")
def login(body: LoginRequest, request: Request):
    if not auth_enabled():
        # No password configured server-side - nothing to log in to.
        return {"authenticated": True, "auth_enabled": False}

    if is_rate_limited(request):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in a few minutes.")

    if not check_password(body.password):
        record_failed_attempt(request)
        raise HTTPException(status_code=401, detail="Incorrect password.")

    clear_failed_attempts(request)
    log_in(request)
    return {"authenticated": True, "auth_enabled": True}


@router.post("/logout")
def logout(request: Request):
    log_out(request)
    return {"authenticated": False}
