import atexit
import errno
import json
import logging
import os
import re
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import deque
from http import HTTPStatus
from types import SimpleNamespace
from urllib.parse import urlparse

logger = logging.getLogger("FandomDiscoveryServer")

from server_modules.camofox_runtime import (
    _camofox_browser_binary,
    _camofox_browser_ready,
    _camofox_browser_root,
    _camofox_server_entry_path,
    _camofox_server_port,
    _local_runtime_root,
    _node_binary,
    _project_root,
    _runtime_root,
)

DEFAULT_CAMOFOX_SERVER_PORT = 9377

DEFAULT_CAMOFOX_SERVER_START_TIMEOUT_SECONDS = 75

DEFAULT_CAMOFOX_FETCH_TIMEOUT_SECONDS = 55

_SERVER_LOCK = threading.Lock()

_SERVER_PROCESS = None

_ACTIVE_SERVER_PORT = None

_SERVER_LOG_TAIL = deque(maxlen=80)

def current_camofox_server_port():
    return _ACTIVE_SERVER_PORT or _camofox_server_port()

def _candidate_camofox_server_ports():
    configured_port = _camofox_server_port()
    explicit = (os.environ.get("EVEOS_CAMOFOX_SERVER_PORT") or "").strip()
    if explicit:
        return [configured_port]

    max_candidates = 6
    return [
        configured_port + offset
        for offset in range(max_candidates)
        if 1 <= configured_port + offset <= 65535
    ]

def _append_server_log(line):
    text = str(line or "").strip()
    if not text:
        return
    _SERVER_LOG_TAIL.append(text)

def _server_log_tail_text():
    return "\n".join(_SERVER_LOG_TAIL)

def _windows_home_root():
    return os.path.join(_local_runtime_root(), "windows-home")

def _windows_camofox_cache_root():
    return os.path.join(
        _windows_home_root(), "AppData", "Local", "camoufox", "camoufox", "Cache"
    )

def _ensure_windows_camofox_compat_cache():
    if os.name != "nt":
        return None

    browser_root = os.path.abspath(_camofox_browser_root())
    cache_root = os.path.abspath(_windows_camofox_cache_root())
    cache_binary = os.path.join(cache_root, os.path.basename(_camofox_browser_binary()))
    cache_manifest = os.path.join(cache_root, "version.json")

    if os.path.isfile(cache_manifest) and os.path.isfile(cache_binary):
        return cache_root

    if os.path.lexists(cache_root):
        raise RuntimeError(
            "EveOS-local Camoufox compatibility cache exists but is incomplete: "
            f"{cache_root}. Stop Camofox and remove only this project-local cache path."
        )

    os.makedirs(os.path.dirname(cache_root), exist_ok=True)
    result = subprocess.run(
        ["cmd.exe", "/d", "/c", "mklink", "/J", cache_root, browser_root],
        capture_output=True,
        text=True,
        check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(
            "Could not create the EveOS-local Camoufox compatibility cache junction"
            + (f": {detail}" if detail else ".")
        )

    if not os.path.isfile(cache_manifest) or not os.path.isfile(cache_binary):
        raise RuntimeError(
            f"EveOS-local Camoufox compatibility cache did not expose the browser at {cache_root}."
        )
    return cache_root

def _is_client_disconnect(exc):
    if isinstance(exc, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
        return True
    if isinstance(exc, OSError):
        if getattr(exc, "winerror", None) in (10053, 10054):
            return True
        if exc.errno in (errno.EPIPE, errno.ECONNRESET, errno.ECONNABORTED):
            return True
    return False

def _safe_send_response(handler, status, content_type, body_bytes):
    try:
        handler.send_response(status)
        handler.send_header("Content-Type", content_type)
        handler.end_headers()
        if body_bytes:
            handler.wfile.write(body_bytes)
        return True
    except Exception as exc:
        if _is_client_disconnect(exc):
            logger.info("Camofox: Client disconnected before response write completed.")
            return False
        raise

def _start_log_thread(pipe, prefix):
    def _reader():
        try:
            for raw_line in iter(pipe.readline, ""):
                line = str(raw_line or "").rstrip()
                if not line:
                    continue
                _append_server_log(line)
                logger.info("Camofox%s %s", prefix, line)
        except Exception:
            return

    thread = threading.Thread(target=_reader, daemon=True)
    thread.start()
    return thread

def _server_env(port=None):
    env = os.environ.copy()
    state_root = _local_runtime_root()
    browser_binary = _camofox_browser_binary()
    if os.name == "nt":
        # @askjo/camofox-browser 1.4.x delegates browser discovery to
        # camoufox-js 0.8.x, whose Windows cache root is derived from
        # os.homedir()/USERPROFILE rather than LOCALAPPDATA. Redirect only this
        # child process to an EveOS-owned synthetic home. The compatibility
        # junction prepared below exposes browser/ at the legacy cache path.
        windows_home = _windows_home_root()
        os.makedirs(windows_home, exist_ok=True)
        env["USERPROFILE"] = windows_home
        env["HOME"] = windows_home
    env["CAMOUFOX_INSTALL_DIR"] = _camofox_browser_root()
    # @askjo/camofox-browser supports an explicit external executable. Set both
    # the canonical variable and compatibility aliases so the pinned server
    # cannot silently fall back to the per-user Camoufox cache.
    env["CAMOUFOX_EXECUTABLE"] = browser_binary
    env["CAMOUFOX_EXECUTABLE_PATH"] = browser_binary
    env["CAMOFOX_EXECUTABLE_PATH"] = browser_binary
    env["CAMOFOX_PROFILE_DIR"] = os.path.join(state_root, "profiles")
    env["CAMOFOX_COOKIES_DIR"] = os.path.join(state_root, "cookies")
    env["CAMOFOX_TRACES_DIR"] = os.path.join(state_root, "traces")
    env["CAMOFOX_UPLOADS_DIR"] = os.path.join(state_root, "uploads")
    env.setdefault("NODE_ENV", "development")
    env["CAMOFOX_PORT"] = str(port or _camofox_server_port())
    env.setdefault("SESSION_TIMEOUT_MS", "600000")
    env.setdefault("TAB_INACTIVITY_MS", "180000")
    env.setdefault("BROWSER_IDLE_TIMEOUT_MS", "180000")
    env.setdefault("MAX_TABS_PER_SESSION", "4")
    env.setdefault("MAX_TABS_GLOBAL", "8")
    env.setdefault("HANDLER_TIMEOUT_MS", "45000")
    return env

def _probe_health(timeout=3, port=None):
    try:
        payload = _json_request("GET", "/health", timeout=timeout, port=port)
        return bool(payload.get("ok") or payload.get("browserConnected") or payload.get("browserRunning"))
    except Exception:
        return False

def _terminate_server_process():
    global _SERVER_PROCESS, _ACTIVE_SERVER_PORT
    process = _SERVER_PROCESS
    _SERVER_PROCESS = None
    if not process:
        return
    _ACTIVE_SERVER_PORT = None
    try:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=5)
    except Exception:
        try:
            process.kill()
            process.wait(timeout=3)
        except Exception:
            pass

def is_camofox_runtime_available():
    return os.path.exists(_camofox_server_entry_path())

def is_camofox_browser_installed():
    return _camofox_browser_ready()

def ensure_camofox_server():
    global _SERVER_PROCESS, _ACTIVE_SERVER_PORT

    if not is_camofox_runtime_available():
        raise RuntimeError(
            "Camofox runtime is not installed. Run tools\\batch\\start-camofox-bridge.bat and choose Install/Update Camofox runtime first."
        )
    if not _camofox_browser_ready():
        raise RuntimeError(
            f"Camofox browser is missing from EveOS: {_camofox_browser_root()}. "
            "Run tools\\batch\\start-camofox-bridge.bat and select Install/Update (option 1)."
        )

    compat_cache = _ensure_windows_camofox_compat_cache()
    if compat_cache:
        logger.info("Camofox: EveOS-local compatibility cache: %s", compat_cache)

    with _SERVER_LOCK:
        if _SERVER_PROCESS and _SERVER_PROCESS.poll() is None and _probe_health(timeout=3):
            return True

        if _probe_health(timeout=3):
            _ACTIVE_SERVER_PORT = current_camofox_server_port()
            return True

        _terminate_server_process()
        candidate_ports = _candidate_camofox_server_ports()
        last_tail = ""

        for index, candidate_port in enumerate(candidate_ports):
            if _probe_health(timeout=3, port=candidate_port):
                _ACTIVE_SERVER_PORT = candidate_port
                return True

            _SERVER_LOG_TAIL.clear()
            logger.info(
                "Camofox: Starting upstream with EveOS-local browser: %s",
                _camofox_browser_binary(),
            )
            process = subprocess.Popen(
                [_node_binary(), _camofox_server_entry_path()],
                cwd=_runtime_root(),
                env=_server_env(candidate_port),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            _SERVER_PROCESS = process
            if process.stdout:
                _start_log_thread(process.stdout, "[server]")
            if process.stderr:
                _start_log_thread(process.stderr, "[server-err]")

            deadline = time.time() + DEFAULT_CAMOFOX_SERVER_START_TIMEOUT_SECONDS
            while time.time() < deadline:
                if process.poll() is not None:
                    break
                if _probe_health(timeout=3, port=candidate_port):
                    _ACTIVE_SERVER_PORT = candidate_port
                    return True
                time.sleep(0.5)

            tail = _server_log_tail_text()
            last_tail = tail
            _terminate_server_process()

            # The default upstream port may already be claimed on this machine.
            # When that happens, walk to the next local candidate instead of failing the bridge.
            if "port in use" in str(tail or "").lower() and index < len(candidate_ports) - 1:
                continue
            break

        message = "Camofox server failed to start."
        if last_tail:
            message = f"{message} {last_tail[-600:]}"
        raise RuntimeError(message)

def _json_request(method, path, payload=None, query=None, timeout=20, port=None):
    target_port = port or current_camofox_server_port()
    url = f"http://127.0.0.1:{target_port}{path}"
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method.upper(), headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            if not raw:
                return {}
            charset = response.headers.get_content_charset() or "utf-8"
            text = raw.decode(charset, errors="replace")
            if "application/json" in (response.headers.get("Content-Type") or "").lower():
                return json.loads(text or "{}")
            return {"text": text}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        detail = body.strip() or exc.reason
        raise RuntimeError(f"Camofox upstream {method} {path} failed with {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Camofox upstream {method} {path} failed: {exc.reason}") from exc

def _cleanup_session(user_id):
    if not user_id:
        return
    try:
        encoded = urllib.parse.quote(str(user_id), safe="")
        _json_request("DELETE", f"/sessions/{encoded}", timeout=10)
    except Exception:
        return

atexit.register(_terminate_server_process)
