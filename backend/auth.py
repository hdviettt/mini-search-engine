"""API key auth for operational endpoints.

Read endpoints (search, explore, stats) stay public — they are the demo.
Anything that writes, crawls, spends money on a third-party API, or schedules
recurring work requires a key.

Fails closed: if ADMIN_API_KEY is unset, every protected route returns 503.
An unset key must never mean "open to everyone".
"""
import hmac
import os

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

API_KEY_HEADER = "X-API-Key"

_api_key_header = APIKeyHeader(name=API_KEY_HEADER, auto_error=False)


def require_api_key(provided: str | None = Depends(_api_key_header)) -> None:
    """FastAPI dependency guarding operational routes."""
    expected = os.getenv("ADMIN_API_KEY", "")

    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ADMIN_API_KEY is not configured; operational endpoints are disabled.",
        )

    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Missing or invalid {API_KEY_HEADER}.",
        )
