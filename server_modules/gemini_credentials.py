"""Local, user-scoped credential storage for the EveOS Gemini backend."""

from __future__ import annotations

import base64
import ctypes
import json
import os
import tempfile
from ctypes import wintypes
from datetime import datetime, timezone
from pathlib import Path


SCHEMA_VERSION = 1
ENV_PATH_KEY = "EVEOS_GEMINI_CREDENTIAL_PATH"


class _DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_byte)),
    ]


def credential_path() -> Path:
    override = os.environ.get(ENV_PATH_KEY, "").strip()
    if override:
        return Path(override).expanduser().resolve()
    local_root = os.environ.get("LOCALAPPDATA", "").strip()
    if local_root:
        return Path(local_root) / "EveOS" / "gemini-credentials.json"
    return Path.home() / ".eveos" / "gemini-credentials.json"


def _protect_windows(value: str) -> str:
    raw = value.encode("utf-8")
    buffer = ctypes.create_string_buffer(raw)
    source = _DataBlob(len(raw), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    protected = _DataBlob()
    crypt32 = ctypes.windll.crypt32
    if not crypt32.CryptProtectData(
        ctypes.byref(source),
        "EveOS Gemini API key",
        None,
        None,
        None,
        0x1,
        ctypes.byref(protected),
    ):
        raise ctypes.WinError()
    try:
        return base64.b64encode(
            ctypes.string_at(protected.pbData, protected.cbData)
        ).decode("ascii")
    finally:
        ctypes.windll.kernel32.LocalFree(protected.pbData)


def _unprotect_windows(value: str) -> str:
    raw = base64.b64decode(value.encode("ascii"))
    buffer = ctypes.create_string_buffer(raw)
    source = _DataBlob(len(raw), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    plain = _DataBlob()
    crypt32 = ctypes.windll.crypt32
    if not crypt32.CryptUnprotectData(
        ctypes.byref(source),
        None,
        None,
        None,
        None,
        0x1,
        ctypes.byref(plain),
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(plain.pbData, plain.cbData).decode("utf-8")
    finally:
        ctypes.windll.kernel32.LocalFree(plain.pbData)


def _encode_key(api_key: str) -> tuple[str, str]:
    if os.name == "nt":
        return "windows-dpapi", _protect_windows(api_key)
    return "user-file", base64.b64encode(api_key.encode("utf-8")).decode("ascii")


def _decode_key(protection: str, value: str) -> str:
    if protection == "windows-dpapi":
        if os.name != "nt":
            return ""
        return _unprotect_windows(value)
    if protection == "user-file":
        return base64.b64decode(value.encode("ascii")).decode("utf-8")
    return ""


def is_valid_api_key(api_key: object) -> bool:
    return isinstance(api_key, str) and len(api_key.strip()) >= 10


def load_api_key() -> str:
    path = credential_path()
    if not path.is_file():
        return ""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return _decode_key(
            str(payload.get("protection", "")),
            str(payload.get("value", "")),
        ).strip()
    except (OSError, ValueError, TypeError):
        return ""


def save_api_key(api_key: str) -> dict:
    normalized = str(api_key or "").strip()
    if not is_valid_api_key(normalized):
        return {
            "ok": False,
            "configured": bool(load_api_key()),
            "message": "Gemini API key was empty or invalid.",
        }

    protection, value = _encode_key(normalized)
    path = credential_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "protection": protection,
        "value": value,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }

    fd, temp_name = tempfile.mkstemp(
        prefix="gemini-credentials-",
        suffix=".json",
        dir=str(path.parent),
        text=True,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
        if os.name != "nt":
            os.chmod(temp_name, 0o600)
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)

    return {
        "ok": True,
        "configured": True,
        "protection": protection,
        "message": "Gemini credentials saved for local EveOS launches.",
    }


def get_status() -> dict:
    path = credential_path()
    configured = bool(load_api_key())
    updated_at = ""
    protection = ""
    if path.is_file():
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            updated_at = str(payload.get("updatedAt", ""))
            protection = str(payload.get("protection", ""))
        except (OSError, ValueError, TypeError):
            pass
    return {
        "ok": True,
        "configured": configured,
        "protection": protection,
        "updatedAt": updated_at,
    }


def read_json_body(handler, max_bytes: int = 16384) -> dict:
    length = int(handler.headers.get("Content-Length", "0") or 0)
    if length <= 0 or length > max_bytes:
        return {}
    raw = handler.rfile.read(length)
    try:
        payload = json.loads(raw.decode("utf-8"))
        return payload if isinstance(payload, dict) else {}
    except (UnicodeDecodeError, ValueError):
        return {}
