"""Operational endpoints must never be reachable without a key.

The important case is the first one: an unset ADMIN_API_KEY has to fail
closed. Failing open would silently restore the original hole.
"""
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from auth import require_api_key


@pytest.fixture
def client():
    app = FastAPI()

    @app.post("/protected", dependencies=[Depends(require_api_key)])
    def protected():
        return {"ok": True}

    return TestClient(app)


def test_fails_closed_when_key_not_configured(client, monkeypatch):
    monkeypatch.delenv("ADMIN_API_KEY", raising=False)
    assert client.post("/protected").status_code == 503


def test_rejects_missing_header(client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_KEY", "secret")
    assert client.post("/protected").status_code == 401


def test_rejects_wrong_key(client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_KEY", "secret")
    assert client.post("/protected", headers={"X-API-Key": "wrong"}).status_code == 401


def test_accepts_correct_key(client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_KEY", "secret")
    r = client.post("/protected", headers={"X-API-Key": "secret"})
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_empty_key_env_still_fails_closed(client, monkeypatch):
    monkeypatch.setenv("ADMIN_API_KEY", "")
    assert client.post("/protected", headers={"X-API-Key": ""}).status_code == 503
