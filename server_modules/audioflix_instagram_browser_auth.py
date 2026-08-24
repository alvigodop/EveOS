"""One-click local Instagram browser sign-in for EveOS.

This module does not read Chrome/Edge profile databases. Instead, Connect Account
starts a dedicated persistent Camofox browser session in desktop mode, opens
Instagram, and lets the user sign in normally. The persistent session is then
reused by the Instagram resolver on subsequent runs.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

AUTH_PORT = int(os.environ.get("EVEOS_INSTAGRAM_BROWSER_PORT", "9382"))
AUTH_USER_ID = "eveos-instagram-account"
AUTH_SESSION_KEY = "instagram-account"

_SERVER_LOCK = threading.Lock()
_SERVER_PROCESS = None
_TAB_ID = None


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _runtime_root() -> Path:
    explicit = os.environ.get("EVEOS_CAMOFOX_RUNTIME_ROOT", "").strip()
    return Path(explicit) if explicit else _project_root() / "tools" / "camofox-runtime"


def _server_entry() -> Path:
    explicit = os.environ.get("EVEOS_CAMOFOX_SERVER_ENTRY", "").strip()
    if explicit:
        return Path(explicit)
    return _runtime_root() / "node_modules" / "@askjo" / "camofox-browser" / "server.js"


def _node_binary() -> str:
    return os.environ.get("EVEOS_CAMOFOX_NODE_BIN", "node").strip() or "node"


def _profile_dir() -> Path:
    local_appdata = os.environ.get("LOCALAPPDATA", "").strip()
    root = Path(local_appdata) / "EveOS" if local_appdata else Path.home() / ".eveos"
    return root / "instagram-browser-profile"


def _state_path() -> Path:
    local_appdata = os.environ.get("LOCALAPPDATA", "").strip()
    root = Path(local_appdata) / "EveOS" if local_appdata else Path.home() / ".eveos"
    return root / "instagram-browser-session.json"


def _state_read() -> dict:
    try:
        data = json.loads(_state_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _state_write(payload: dict) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _request(method: str, path: str, payload: dict | None = None, timeout: int = 20) -> dict:
    body = None
    headers = {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        f"http://127.0.0.1:{AUTH_PORT}{path}",
        data=body,
        method=method.upper(),
        headers=headers,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
        return json.loads(raw or "{}") if raw else {}


def _health(timeout: int = 2) -> bool:
    try:
        payload = _request("GET", "/health", timeout=timeout)
        return bool(payload.get("ok") or payload.get("browserConnected") or payload.get("browserRunning"))
    except Exception:
        return False


def _start_server() -> bool:
    global _SERVER_PROCESS
    with _SERVER_LOCK:
        if _health():
            return True
        process = _SERVER_PROCESS
        if process and process.poll() is None:
            return False

        env = os.environ.copy()
        env["CAMOFOX_PORT"] = str(AUTH_PORT)
        env["CAMOFOX_INTERACTIVE"] = "desktop"
        env["CAMOFOX_PROFILE_DIR"] = str(_profile_dir())
        env.setdefault("SESSION_TIMEOUT_MS", "1800000")
        env.setdefault("BROWSER_IDLE_TIMEOUT_MS", "1800000")
        env.setdefault("MAX_TABS_PER_SESSION", "4")
        env.setdefault("MAX_TABS_GLOBAL", "8")

        _profile_dir().mkdir(parents=True, exist_ok=True)
        _SERVER_PROCESS = subprocess.Popen(
            [_node_binary(), str(_server_entry())],
            cwd=str(_runtime_root()),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        deadline = time.time() + 60
        while time.time() < deadline:
            if _health(timeout=2):
                return True
            if _SERVER_PROCESS.poll() is not None:
                return False
            time.sleep(0.5)
        return False


def _find_tab() -> dict | None:
    try:
        payload = _request("GET", f"/tabs?userId={urllib.parse.quote(AUTH_USER_ID, safe='')}", timeout=8)
        tabs = payload.get("tabs") if isinstance(payload, dict) else None
        if not isinstance(tabs, list):
            return None
        for tab in tabs:
            if isinstance(tab, dict) and str(tab.get("tabId") or "").strip():
                return tab
    except Exception:
        return None
    return None


def _ensure_tab() -> dict | None:
    global _TAB_ID
    tab = _find_tab()
    if tab:
        _TAB_ID = str(tab.get("tabId"))
        return tab
    try:
        created = _request(
            "POST",
            "/tabs",
            {
                "userId": AUTH_USER_ID,
                "sessionKey": AUTH_SESSION_KEY,
                "url": "https://www.instagram.com/",
            },
            timeout=20,
        )
        _TAB_ID = str(created.get("tabId") or "").strip() or None
        return created if _TAB_ID else None
    except Exception:
        return None


def _login_state(tab_id: str) -> dict:
    expression = r"""(() => {
      const body = (document.body?.innerText || '').slice(0, 20000).toLowerCase();
      const loginLinks = !!document.querySelector('a[href*="/accounts/login"]');
      const hasCreate = body.includes('create new account');
      const hasSignUp = body.includes('sign up');
      const hasLogin = body.includes('log in') || body.includes('login');
      const cookieText = document.cookie || '';
      const hasInstagramSessionHint = /(?:csrftoken|ds_user_id|ig_did)=/i.test(cookieText);
      return {
        url: location.href,
        title: document.title || '',
        loginLinks,
        hasCreate,
        hasSignUp,
        hasLogin,
        hasInstagramSessionHint,
        likelyAuthenticated: hasInstagramSessionHint || (!loginLinks && !hasCreate && !hasSignUp && !hasLogin)
      };
    })()"""
    try:
        payload = _request(
            "POST",
            f"/tabs/{urllib.parse.quote(tab_id, safe='')}/evaluate",
            {"userId": AUTH_USER_ID, "expression": expression},
            timeout=12,
        )
        result = payload.get("result") if isinstance(payload, dict) else None
        return result if isinstance(result, dict) else {}
    except Exception:
        return {}


def start() -> dict:
    if not _start_server():
        return {"ok": False, "reason": "EveOS could not start the local Instagram browser."}
    tab = _ensure_tab()
    if not tab:
        return {"ok": False, "reason": "EveOS could not open the Instagram sign-in browser."}
    state = _login_state(str(tab.get("tabId") or _TAB_ID or ""))
    _state_write({"userId": AUTH_USER_ID, "tabId": str(tab.get("tabId") or _TAB_ID or ""), "updatedAt": int(time.time())})
    if state.get("likelyAuthenticated"):
        return {"ok": True, "connected": True, "state": "connected", "message": "Instagram is already connected in the EveOS browser."}
    return {
        "ok": True,
        "connected": False,
        "state": "browser_open",
        "message": "Instagram sign-in opened in the EveOS browser. Sign in there once; EveOS will keep the session locally.",
    }


def status() -> dict:
    tab = _find_tab()
    if not tab:
        return {"ok": True, "connected": False, "state": "not_started"}
    tab_id = str(tab.get("tabId") or "")
    state = _login_state(tab_id)
    connected = bool(state.get("likelyAuthenticated"))
    return {
        "ok": True,
        "connected": connected,
        "state": "connected" if connected else "awaiting_login",
        "message": "Instagram browser session is ready." if connected else "Instagram sign-in is still required in the EveOS browser.",
    }


def disconnect() -> dict:
    global _TAB_ID
    try:
        _request("DELETE", f"/sessions/{urllib.parse.quote(AUTH_USER_ID, safe='')}", timeout=15)
    except Exception:
        pass
    _TAB_ID = None
    try:
        _state_path().unlink(missing_ok=True)
    except OSError:
        pass
    return {"ok": True, "connected": False, "state": "disconnected"}


def browser_session_ready() -> bool:
    return bool(status().get("connected"))


def auth_user_id() -> str:
    return AUTH_USER_ID


def auth_port() -> int:
    return AUTH_PORT
