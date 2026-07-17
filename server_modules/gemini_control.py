"""Loopback-only lifecycle control for the EveOS Gemini backend."""

from __future__ import annotations

import json
import os
import signal
import socket
import http.client
import subprocess
import sys
import time
from pathlib import Path

from . import gemini_credentials


WEBSOCKET_PORT = 9083
STATUS_PORT = 9084
_PROCESS = None


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _main_script() -> Path:
    return _project_root() / "server" / "gemini-backend" / "interactions" / "main.py"


def _port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.2):
            return True
    except OSError:
        return False


def _status_http_ready() -> bool:
    connection = None
    try:
        connection = http.client.HTTPConnection("127.0.0.1", STATUS_PORT, timeout=0.6)
        connection.request("GET", "/status", headers={"Connection": "close"})
        response = connection.getresponse()
        response.read(256)
        return response.status == 200
    except OSError:
        return False
    except Exception:
        return False
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass


# A full `netstat -ano` sweep costs hundreds of milliseconds on Windows, and the status
# payload used to run it once PER PORT. Browser-side controller probes time out at well under
# a second, so status calls that crossed that budget made localhost EveOS report the Gemini
# controller as unreachable ("checking" forever). One shared snapshot with a short TTL keeps
# polls cheap; lifecycle transitions request a fresh sweep.
_NETSTAT_TTL_SECONDS = 2.0
_NETSTAT_CACHE = {"at": 0.0, "text": ""}


def _netstat_text(fresh: bool = False) -> str:
    now = time.monotonic()
    if (
        not fresh
        and _NETSTAT_CACHE["text"]
        and (now - _NETSTAT_CACHE["at"]) < _NETSTAT_TTL_SECONDS
    ):
        return _NETSTAT_CACHE["text"]
    result = subprocess.run(
        ["netstat", "-ano", "-p", "tcp"],
        capture_output=True,
        text=True,
        check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    _NETSTAT_CACHE["at"] = now
    _NETSTAT_CACHE["text"] = result.stdout or ""
    return _NETSTAT_CACHE["text"]


def _listener_pids(port: int, fresh: bool = False) -> list[int]:
    if os.name == "nt":
        pids = []
        marker = f":{port}"
        for line in _netstat_text(fresh).splitlines():
            if marker not in line or "LISTENING" not in line.upper():
                continue
            parts = line.split()
            if parts and parts[-1].isdigit():
                pids.append(int(parts[-1]))
        return sorted(set(pids))

    result = subprocess.run(
        ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
        capture_output=True,
        text=True,
        check=False,
    )
    return sorted({int(value) for value in result.stdout.split() if value.isdigit()})


def _terminate_pid(pid: int) -> bool:
    if pid <= 0 or pid == os.getpid():
        return False
    try:
        if os.name == "nt":
            result = subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True,
                text=True,
                check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            return result.returncode == 0
        os.kill(pid, signal.SIGTERM)
        return True
    except OSError:
        return False


def _status_payload(message: str = "", fresh: bool = False) -> dict:
    websocket_pids = _listener_pids(WEBSOCKET_PORT, fresh)
    status_pids = _listener_pids(STATUS_PORT)
    websocket_ready = bool(websocket_pids) and _port_open(WEBSOCKET_PORT)
    status_port_open = bool(status_pids) and _port_open(STATUS_PORT)
    status_ready = status_port_open and _status_http_ready()
    process_alive = bool(_PROCESS and _PROCESS.poll() is None)
    running = websocket_ready and status_ready
    state = "running" if running else ("starting" if process_alive else "stopped")
    return {
        "ok": True,
        "controllerAvailable": True,
        "state": state,
        "running": running,
        "websocketReady": websocket_ready,
        "statusReady": status_ready,
        "statusPortOpen": status_port_open,
        "websocketPort": WEBSOCKET_PORT,
        "statusPort": STATUS_PORT,
        "pids": sorted(set(websocket_pids + status_pids)),
        "message": message or f"Gemini server is {state}.",
    }


def get_status() -> dict:
    return _status_payload()


def start_server() -> dict:
    global _PROCESS

    current = _status_payload(fresh=True)
    if current["running"]:
        current["message"] = "Gemini server is already running."
        return current

    # Partial listeners are a bad state: the UI sees a port but cannot complete
    # health checks. Restart the Gemini backend instead of leaving it "starting"
    # forever.
    if (current["websocketReady"] or current.get("statusPortOpen")) and not current["running"]:
        for pid in sorted(set(_listener_pids(WEBSOCKET_PORT, fresh=True) + _listener_pids(STATUS_PORT))):
            _terminate_pid(pid)
        _PROCESS = None
        time.sleep(0.35)

    script = _main_script()
    if not script.exists():
        return {
            "ok": False,
            "controllerAvailable": True,
            "state": "error",
            "running": False,
            "message": f"Gemini entry point was not found: {script}",
        }

    if not (_PROCESS and _PROCESS.poll() is None):
        flags = 0
        if os.name == "nt":
            flags = (
                getattr(subprocess, "CREATE_NO_WINDOW", 0)
                | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            )
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        # Hidden Windows processes otherwise inherit a legacy code page and can
        # crash while printing UTF-8 status text before either server binds.
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        saved_api_key = gemini_credentials.load_api_key()
        if saved_api_key:
            env["GOOGLE_API_KEY"] = saved_api_key
        _PROCESS = subprocess.Popen(
            [sys.executable, str(script), "--port", str(WEBSOCKET_PORT)],
            cwd=str(script.parent),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
            creationflags=flags,
        )

    deadline = time.monotonic() + 1.5
    while time.monotonic() < deadline:
        if _port_open(WEBSOCKET_PORT) and _port_open(STATUS_PORT):
            break
        if _PROCESS.poll() is not None:
            break
        time.sleep(0.1)

    payload = _status_payload("Gemini server started." if _port_open(WEBSOCKET_PORT) else "Gemini server is starting.", fresh=True)
    if _PROCESS.poll() is not None and not payload["running"]:
        payload.update(ok=False, state="error", message="Gemini server exited before becoming ready.")
    return payload


def stop_server() -> dict:
    global _PROCESS

    stopped = False
    for port in (WEBSOCKET_PORT, STATUS_PORT):
        for pid in _listener_pids(port, fresh=True):
            stopped = _terminate_pid(pid) or stopped

    if _PROCESS and _PROCESS.poll() is None:
        try:
            _PROCESS.terminate()
            _PROCESS.wait(timeout=2)
            stopped = True
        except (OSError, subprocess.TimeoutExpired):
            try:
                _PROCESS.kill()
                stopped = True
            except OSError:
                pass
    _PROCESS = None

    deadline = time.monotonic() + 2
    while time.monotonic() < deadline and (_port_open(WEBSOCKET_PORT) or _port_open(STATUS_PORT)):
        time.sleep(0.1)

    return _status_payload("Gemini server stopped." if stopped else "Gemini server was already stopped.", fresh=True)


def request_can_control(handler) -> bool:
    client_host = str(handler.client_address[0] if handler.client_address else "")
    if client_host not in {"127.0.0.1", "::1"}:
        return False
    origin = str(handler.headers.get("Origin", "")).strip().lower()
    if not origin or origin == "null" or origin.startswith("file://"):
        return True
    return origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:")


def send_json(handler, payload: dict, status: int = 200) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)
