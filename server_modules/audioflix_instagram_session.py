"""Local Instagram session import for EveOS Audioflix.

The supported fast path is user-initiated browser import: an EveOS browser
connector extension reads only Instagram cookies from the active signed-in
browser session and posts them to the localhost control plane. Cookies are
stored in the existing Camofox site-cookie config so the browser resolver can
reuse the authenticated session.

No browser profile databases are opened by EveOS.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path

_MAX_COOKIE_COUNT = 128
_MAX_COOKIE_VALUE = 8192

def _config_path() -> Path:
    explicit = (os.environ.get("EVEOS_CAMOFOX_COOKIE_CONFIG") or "").strip()
    if explicit:
        return Path(explicit).expanduser()
    local_appdata = (os.environ.get("LOCALAPPDATA") or "").strip()
    root = Path(local_appdata) / "EveOS" if local_appdata else Path.home() / ".eveos"
    return root / "camofox-site-cookies.json"

def _load() -> dict:
    path = _config_path()
    try:
        if path.is_file():
            payload = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                return payload
    except (OSError, ValueError):
        pass
    return {}

def _normalize_cookie(cookie: dict) -> dict | None:
    if not isinstance(cookie, dict):
        return None
    name = str(cookie.get("name") or "").strip()
    value = str(cookie.get("value") or "")
    domain = str(cookie.get("domain") or "").strip().lower()
    if not name or not domain or len(value) > _MAX_COOKIE_VALUE:
        return None
    if not (domain == "instagram.com" or domain.endswith(".instagram.com") or domain == ".instagram.com"):
        return None
    result = {
        "name": name, "value": value, "domain": domain,
        "path": str(cookie.get("path") or "/"),
        "secure": bool(cookie.get("secure", True)),
        "httpOnly": bool(cookie.get("httpOnly", False)),
    }
    if cookie.get("sameSite"):
        result["sameSite"] = str(cookie["sameSite"])
    if cookie.get("expirationDate") is not None:
        try:
            result["expires"] = int(float(cookie["expirationDate"]))
        except (TypeError, ValueError):
            pass
    return result

def import_cookies(payload: dict) -> dict:
    raw = payload.get("cookies") if isinstance(payload, dict) else None
    if not isinstance(raw, list):
        return {"ok": False, "reason": "No browser cookies were supplied."}
    cookies = []
    seen = set()
    for item in raw[:_MAX_COOKIE_COUNT]:
        normalized = _normalize_cookie(item)
        if not normalized:
            continue
        key = (normalized["domain"], normalized["path"], normalized["name"])
        if key in seen:
            continue
        seen.add(key)
        cookies.append(normalized)
    if not cookies:
        return {"ok": False, "reason": "No usable Instagram cookies were supplied."}
    config = _load()
    if not isinstance(config, dict):
        config = {}
    cookie_map = config.get("cookies")
    if not isinstance(cookie_map, dict):
        cookie_map = {}
    cookie_map["instagram.com"] = cookies
    config["cookies"] = cookie_map
    config["updatedAt"] = int(time.time())
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".instagram-cookies-", suffix=".json", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(config, handle, indent=2)
            handle.write("\n")
        os.replace(temp_name, path)
    finally:
        try: os.unlink(temp_name)
        except OSError: pass
    return {"ok": True, "cookieCount": len(cookies), "configPath": str(path), "message": "Instagram session connected. Audioflix can now use the authenticated browser session."}

def status() -> dict:
    path = _config_path()
    try:
        payload = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    except (OSError, ValueError):
        payload = {}
    cookies = payload.get("cookies", {}) if isinstance(payload, dict) else {}
    instagram = cookies.get("instagram.com", []) if isinstance(cookies, dict) else []
    return {"ok": True, "connected": bool(instagram), "cookieCount": len(instagram) if isinstance(instagram, list) else 0, "configPath": str(path), "updatedAt": payload.get("updatedAt") if isinstance(payload, dict) else None}

def clear() -> dict:
    path = _config_path()
    if not path.exists(): return {"ok": True, "connected": False, "cookieCount": 0}
    try:
        payload = _load()
        if isinstance(payload, dict) and isinstance(payload.get("cookies"), dict):
            payload["cookies"].pop("instagram.com", None)
            payload["updatedAt"] = int(time.time())
            path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        return {"ok": True, "connected": False, "cookieCount": 0}
    except OSError as exc:
        return {"ok": False, "reason": str(exc)}
