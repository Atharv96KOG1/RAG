import secrets

from fastapi import APIRouter, HTTPException

from src.api.schemas.auth import LoginRequest, TokenResponse
from src.core.auth import create_access_token
from src.core.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest):
    # compare_digest (constant-time) instead of `==` — a plain equality check leaks how
    # many leading characters matched via response timing, which matters for a password.
    valid = secrets.compare_digest(request.username, settings.auth_username) and secrets.compare_digest(
        request.password, settings.auth_password
    )
    if not valid:
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    return TokenResponse(access_token=create_access_token(subject=request.username))
