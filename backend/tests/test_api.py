# Tests del backend (FastAPI TestClient).
# Ejecutar:  cd backend && pip install -r requirements-dev.txt && pytest -q
# Usa un DATA_DIR temporal para no tocar la base de datos real.
import os
import tempfile
import importlib

import pytest
from fastapi.testclient import TestClient

_PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000d49444154789c6360000002000100ffff03000006000557bfabd400"
    "00000049454e44ae426082"
)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    import accounts; importlib.reload(accounts)
    import app as appmod; importlib.reload(appmod)
    return TestClient(appmod.app)


def _register(client, email="a@b.com", pw="secret1"):
    return client.post("/auth/register", json={"email": email, "password": pw})


def test_health_and_pages(client):
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/").status_code == 200
    assert client.get("/privacy").status_code == 200
    assert client.get("/terms").status_code == 200
    assert "stylize" in client.get("/capabilities").json()


def test_register_login_flow(client):
    r = _register(client)
    assert r.status_code == 200
    token = r.json()["token"]
    assert r.json()["user"]["email"] == "a@b.com"
    # email duplicado
    assert _register(client).status_code == 409
    # login ok / mal
    assert client.post("/auth/login", json={"email": "a@b.com", "password": "secret1"}).status_code == 200
    assert client.post("/auth/login", json={"email": "a@b.com", "password": "mal"}).status_code == 401
    # /me con token
    me = client.get("/auth/me", headers={"Authorization": "Bearer " + token})
    assert me.json()["user"]["plan"] == "free"
    # /me sin token
    assert client.get("/auth/me").status_code == 401


def test_validation(client):
    assert client.post("/auth/register", json={"email": "no-email", "password": "secret1"}).status_code == 400
    assert client.post("/auth/register", json={"email": "x@y.com", "password": "123"}).status_code == 400


def test_flags_and_sync(client):
    token = _register(client).json()["token"]
    h = {"Authorization": "Bearer " + token}
    assert client.post("/user/flags", json={"tutorialDone": True, "hints": 1}, headers=h).json()["user"]["hints"] == 1
    client.put("/sync/creations/c1", json={"updatedAt": 5, "progress": 30, "thumb": "", "payload": "{\"x\":1}"}, headers=h)
    lst = client.get("/sync/creations", headers=h).json()["creations"]
    assert len(lst) == 1 and lst[0]["id"] == "c1"
    assert client.get("/sync/creations/c1", headers=h).json()["payload"] == "{\"x\":1}"
    client.delete("/sync/creations/c1", headers=h)
    assert client.get("/sync/creations", headers=h).json()["creations"] == []


def test_export_and_delete_account(client):
    token = _register(client, "del@b.com").json()["token"]
    h = {"Authorization": "Bearer " + token}
    assert client.get("/user/export", headers=h).json()["account"]["email"] == "del@b.com"
    assert client.request("DELETE", "/user/account", headers=h).json()["ok"] is True
    # tras borrar no se puede entrar
    assert client.post("/auth/login", json={"email": "del@b.com", "password": "secret1"}).status_code == 401


def test_rate_limit_register(client):
    codes = [_register(client, f"u{i}@b.com").status_code for i in range(6)]
    assert codes[:5] == [200] * 5
    assert codes[5] == 429


def test_generate_rejects_non_image(client):
    r = client.post("/generate", files={"file": ("x.png", b"not an image", "image/png")})
    assert r.status_code == 400


def test_sync_requires_auth(client):
    assert client.get("/sync/creations").status_code == 401
    assert client.get("/sync/creations", headers={"Authorization": "Bearer bad.1.x"}).status_code == 401
