"""Local Instagram session storage and browser-auth status for EveOS Audioflix.

The preferred user flow is the built-in EveOS browser session. The explicit
cookie-file import remains available as an advanced fallback, but users do
not need a browser extension or manual cookie export for normal use.
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
        "name": name,
        "value": value,
        "domain": domain,
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


def _netscape_path() -> Path:
    explicit = (os.environ.get("EVEOS_INSTAGRAM_COOKIES") or "").strip()
    if explicit:
        return Path(explicit).expanduser()
    local_appdata = (os.environ.get("LOCALAPPDATA") or "").strip()
    root = Path(local_appdata) / "EveOS" if local_appdata else Path.home() / ".eveos"
    return root / "instagram-cookies.txt"


def _write_netscape_file(cookies: list[dict], path: Path) -> None:
    lines = ["# Netscape HTTP Cookie File", "# https://curl.haxx.se/rfc/cookie_spec.html", ""]
    for cookie in cookies:
        domain = cookie.get("domain", "instagram.com")
        include_sub = "TRUE" if domain.startswith(".") else "FALSE"
        path_str = cookie.get("path", "/")
        secure = "TRUE" if cookie.get("secure", True) else "FALSE"
        expires = str(cookie.get("expires", 2147483647))
        name = cookie.get("name", "")
        value = cookie.get("value", "")
        if name and value:
            lines.append(f"{domain}\t{include_sub}\t{path_str}\t{secure}\t{expires}\t{name}\t{value}")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except OSError:
        pass


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
        try:
            os.unlink(temp_name)
        except OSError:
            pass
    _write_netscape_file(cookies, _netscape_path())
    return {"ok": True, "cookieCount": len(cookies), "configPath": str(path), "message": "Instagram session connected."}


def browser_status() -> dict:
    try:
        from server_modules import audioflix_instagram_browser_auth
        return audioflix_instagram_browser_auth.status()
    except Exception:
        return {"ok": True, "connected": False, "state": "browser_unavailable"}


def connect_browser() -> dict:
    try:
        from server_modules import audioflix_instagram_browser_auth
        return audioflix_instagram_browser_auth.start()
    except Exception as exc:
        return {"ok": False, "reason": str(exc)}


def status() -> dict:
    browser = browser_status()
    if browser.get("connected") or browser.get("state") in {"browser_open", "awaiting_login"}:
        return {
            "ok": True,
            "connected": bool(browser.get("connected")),
            "state": browser.get("state"),
            "cookieCount": 0,
            "source": "eveos-browser",
            "message": browser.get("message") or "Instagram browser session status available.",
        }
    path = _config_path()
    try:
        payload = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    except (OSError, ValueError):
        payload = {}
    cookies = payload.get("cookies", {}) if isinstance(payload, dict) else {}
    instagram = cookies.get("instagram.com", []) if isinstance(cookies, dict) else []
    return {
        "ok": True,
        "connected": bool(instagram),
        "state": "cookie_file" if instagram else "not_connected",
        "cookieCount": len(instagram) if isinstance(instagram, list) else 0,
        "configPath": str(path),
        "updatedAt": payload.get("updatedAt") if isinstance(payload, dict) else None,
        "source": "cookie-file",
    }


def clear() -> dict:
    try:
        from server_modules import audioflix_instagram_browser_auth
        audioflix_instagram_browser_auth.disconnect()
    except Exception:
        pass
    path = _config_path()
    netscape = _netscape_path()
    if netscape.exists():
        try:
            netscape.unlink()
        except OSError:
            pass
    if not path.exists():
        return {"ok": True, "connected": False, "cookieCount": 0, "state": "disconnected"}
    try:
        payload = _load()
        if isinstance(payload, dict) and isinstance(payload.get("cookies"), dict):
            payload["cookies"].pop("instagram.com", None)
            payload["updatedAt"] = int(time.time())
            path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        return {"ok": True, "connected": False, "cookieCount": 0, "state": "disconnected"}
    except OSError as exc:
        return {"ok": False, "reason": str(exc)}
