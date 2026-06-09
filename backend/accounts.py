"""Cuentas de usuario + sincronizacion de creaciones (SQLite, sin dependencias).

- Registro / login con email + password (PBKDF2) y token firmado (HMAC).
- El progreso (creaciones) se sincroniza por usuario: el cliente sube/baja sus
  puzzles para no perderlos al cambiar de dispositivo o limpiar el navegador.
- Flags de usuario: tutorial visto, plan (free/plus), pistas restantes.

La base de datos vive en DATA_DIR (por defecto backend/data/). En hosting sin
disco persistente los datos se pierden al redesplegar: usa un disco o una BD
externa para produccion real.
"""

import gzip
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import time
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter()

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "app.db"

TOKEN_TTL = 60 * 60 * 24 * 30  # 30 dias
MAX_CREATION_BYTES = 15 * 1024 * 1024


def _secret() -> bytes:
    """Clave para firmar tokens: SECRET_KEY del entorno o fichero generado."""
    env = os.environ.get("SECRET_KEY")
    if env:
        return env.encode()
    f = DATA_DIR / "secret.key"
    if not f.exists():
        f.write_text(secrets.token_hex(32))
    return f.read_text().strip().encode()


SECRET = _secret()


def _db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    return con


def init_db():
    with _db() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            pw_hash BLOB NOT NULL,
            salt BLOB NOT NULL,
            plan TEXT NOT NULL DEFAULT 'free',
            hints INTEGER NOT NULL DEFAULT 3,
            tutorial_done INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        )""")
        con.execute("""CREATE TABLE IF NOT EXISTS creations (
            id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            progress INTEGER NOT NULL DEFAULT 0,
            thumb TEXT NOT NULL DEFAULT '',
            payload_gz BLOB NOT NULL,
            PRIMARY KEY (id, user_id)
        )""")


init_db()


# ---------------------------------------------------------------- tokens ----

def _make_token(uid: int) -> str:
    exp = int(time.time()) + TOKEN_TTL
    msg = f"{uid}.{exp}"
    sig = hmac.new(SECRET, msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}.{sig}"


def _check_token(token: str) -> int:
    try:
        uid_s, exp_s, sig = token.split(".")
        msg = f"{uid_s}.{exp_s}"
        good = hmac.new(SECRET, msg.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, good) or int(exp_s) < time.time():
            raise ValueError
        return int(uid_s)
    except Exception:
        raise HTTPException(status_code=401, detail="Sesión caducada. Entra de nuevo.")


def _uid(authorization: str = Header(default="")) -> int:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Falta el token.")
    return _check_token(authorization[7:])


# ----------------------------------------------------------------- auth -----

class Credentials(BaseModel):
    email: str
    password: str


def _hash_pw(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)


def _user_payload(row) -> dict:
    return {
        "email": row["email"],
        "plan": row["plan"],
        "hints": row["hints"],
        "tutorialDone": bool(row["tutorial_done"]),
    }


@router.post("/auth/register")
def register(body: Credentials):
    email = body.email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail="Email no válido.")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña necesita al menos 6 caracteres.")
    salt = secrets.token_bytes(16)
    with _db() as con:
        try:
            cur = con.execute(
                "INSERT INTO users (email, pw_hash, salt, created_at) VALUES (?,?,?,?)",
                (email, _hash_pw(body.password, salt), salt, int(time.time())),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email.")
        row = con.execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone()
    return {"token": _make_token(row["id"]), "user": _user_payload(row)}


@router.post("/auth/login")
def login(body: Credentials):
    email = body.email.strip().lower()
    with _db() as con:
        row = con.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if row is None or not hmac.compare_digest(_hash_pw(body.password, row["salt"]), row["pw_hash"]):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos.")
    return {"token": _make_token(row["id"]), "user": _user_payload(row)}


@router.get("/auth/me")
def me(uid: int = None, authorization: str = Header(default="")):
    uid = _uid(authorization)
    with _db() as con:
        row = con.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Cuenta no encontrada.")
    return {"user": _user_payload(row)}


class Flags(BaseModel):
    tutorialDone: bool | None = None
    plan: str | None = None
    hints: int | None = None


@router.post("/user/flags")
def set_flags(body: Flags, authorization: str = Header(default="")):
    uid = _uid(authorization)
    with _db() as con:
        if body.tutorialDone is not None:
            con.execute("UPDATE users SET tutorial_done=? WHERE id=?", (int(body.tutorialDone), uid))
        if body.plan in ("free", "plus"):
            con.execute("UPDATE users SET plan=? WHERE id=?", (body.plan, uid))
        if body.hints is not None:
            con.execute("UPDATE users SET hints=? WHERE id=?", (max(0, min(int(body.hints), 999)), uid))
        row = con.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return {"user": _user_payload(row)}


# ----------------------------------------------------------------- sync -----

class CreationIn(BaseModel):
    updatedAt: int
    progress: int = 0
    thumb: str = ""
    payload: str  # JSON serializado de la creacion completa (doc + paintedIds...)


@router.get("/sync/creations")
def list_creations(authorization: str = Header(default="")):
    uid = _uid(authorization)
    with _db() as con:
        rows = con.execute(
            "SELECT id, updated_at, progress, thumb FROM creations WHERE user_id=? ORDER BY updated_at DESC",
            (uid,),
        ).fetchall()
    return {"creations": [
        {"id": r["id"], "updatedAt": r["updated_at"], "progress": r["progress"], "thumb": r["thumb"]}
        for r in rows
    ]}


@router.get("/sync/creations/{cid}")
def get_creation(cid: str, authorization: str = Header(default="")):
    uid = _uid(authorization)
    with _db() as con:
        row = con.execute(
            "SELECT payload_gz FROM creations WHERE id=? AND user_id=?", (cid, uid)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No existe.")
    return {"payload": gzip.decompress(row["payload_gz"]).decode()}


@router.put("/sync/creations/{cid}")
def put_creation(cid: str, body: CreationIn, authorization: str = Header(default="")):
    uid = _uid(authorization)
    if len(body.payload) > MAX_CREATION_BYTES:
        raise HTTPException(status_code=413, detail="Creación demasiado grande.")
    blob = gzip.compress(body.payload.encode(), compresslevel=6)
    with _db() as con:
        con.execute(
            """INSERT INTO creations (id, user_id, updated_at, progress, thumb, payload_gz)
               VALUES (?,?,?,?,?,?)
               ON CONFLICT(id, user_id) DO UPDATE SET
                 updated_at=excluded.updated_at, progress=excluded.progress,
                 thumb=excluded.thumb, payload_gz=excluded.payload_gz""",
            (cid, uid, body.updatedAt, body.progress, body.thumb, blob),
        )
    return {"ok": True}


@router.delete("/sync/creations/{cid}")
def delete_creation(cid: str, authorization: str = Header(default="")):
    uid = _uid(authorization)
    with _db() as con:
        con.execute("DELETE FROM creations WHERE id=? AND user_id=?", (cid, uid))
    return {"ok": True}
