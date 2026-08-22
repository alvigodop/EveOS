"""Persisted lifecycle control for the bundled Piano Auto Player tool."""

from __future__ import annotations

import http.client
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

from . import eveos_console_prefs


PIANO_PORT = int(os.environ.get("PIANO_PLAYER_PORT") or 8771)
_PROCESS = None
_LOCK = threading.RLock()


def _root() -> Path:
    return Path(__file__).resolve().parent.parent


def _entry() -> Path:
    return _root() / "tools" / "Piano-Auto-Player" / "run.py"


def _preference() -> Path:
    return _root() / "data" / "runtime" / "piano-player-service.json"


def _desired() -> bool:
    try:
        return json.loads(_preference().read_text(encoding="utf-8")).get("desiredRunning") is True
    except (OSError, ValueError, TypeError):
        return False


def _write_desired(enabled: bool) -> None:
    path = _preference()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({
        "desiredRunning": bool(enabled),
        "port": PIANO_PORT,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }, indent=2), encoding="utf-8")
    temporary.replace(path)


def _health() -> dict | None:
    connection = None
    try:
        connection = http.client.HTTPConnection("127.0.0.1", PIANO_PORT, timeout=0.8)
        connection.request("GET", "/api/status", headers={"Connection": "close"})
        response = connection.getresponse()
        payload = json.loads(response.read(65536).decode("utf-8"))
        if response.status != 200 or payload.get("ok") is not True:
            return None
        if payload.get("service") != "piano-auto-player" or not payload.get("appVersion"):
            return None
        return payload
    except (OSError, ValueError, UnicodeError, http.client.HTTPException):
        return None
    finally:
        if connection:
            try:
                connection.close()
            except OSError:
                pass


def _port_open() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", PIANO_PORT), timeout=0.25):
            return True
    except OSError:
        return False


def _pids() -> list[int]:
    if os.name == "nt":
        result = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"], capture_output=True, text=True,
            check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        marker = f":{PIANO_PORT}"
        return sorted({
            int(parts[-1]) for line in (result.stdout or "").splitlines()
            if marker in line and "LISTENING" in line.upper()
            if (parts := line.split()) and parts[-1].isdigit()
        })
    result = subprocess.run(
        ["lsof", "-nP", f"-iTCP:{PIANO_PORT}", "-sTCP:LISTEN", "-t"],
        capture_output=True, text=True, check=False,
    )
    return sorted({int(value) for value in result.stdout.split() if value.isdigit()})


def _terminate(pid: int) -> bool:
    if pid <= 0 or pid == os.getpid():
        return False
    try:
        if os.name == "nt":
            result = subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True,
                text=True, check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            return result.returncode == 0
        os.kill(pid, signal.SIGTERM)
        return True
    except OSError:
        return False


def _status(message: str = "") -> dict:
    health = _health()
    process_alive = bool(_PROCESS and _PROCESS.poll() is None)
    running = health is not None
    blocked = _port_open() and not running
    installed = _entry().is_file()
    state = "running" if running else "starting" if process_alive else "blocked" if blocked else "stopped"
    return {
        "ok": installed and not blocked,
        "controllerAvailable": True,
        "installed": installed,
        "state": state,
        "running": running,
        "desiredRunning": _desired(),
        "port": PIANO_PORT,
        "url": f"http://127.0.0.1:{PIANO_PORT}/",
        "appVersion": str(health.get("appVersion") or "") if health else "",
        "pids": _pids() if running else [],
        "message": message or (
            "Piano Auto Player is online." if running
            else "The Piano Auto Player port belongs to another service." if blocked
            else "Piano Auto Player is stopped."
        ),
    }


def get_status() -> dict:
    with _LOCK:
        return _status()


def start_server(*, persist: bool = True) -> dict:
    global _PROCESS
    with _LOCK:
        if persist:
            _write_desired(True)
        current = _status()
        if current["running"]:
            current["message"] = "Piano Auto Player is already online."
            return current
        if current["state"] == "blocked":
            current["ok"] = False
            return current
        entry = _entry()
        if not entry.is_file():
            return {**current, "ok": False, "state": "error", "message": f"Entry point missing: {entry}"}

        environment = os.environ.copy()
        environment.update(PYTHONUNBUFFERED="1", PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
        headless = eveos_console_prefs.headless_for("piano")
        flags = 0
        if os.name == "nt":
            flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            flags |= getattr(subprocess, "CREATE_NO_WINDOW" if headless else "CREATE_NEW_CONSOLE", 0)
        _PROCESS = subprocess.Popen(
            [sys.executable, str(entry), "--host", "127.0.0.1", "--port", str(PIANO_PORT), "--no-browser"],
            cwd=str(entry.parent), stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL if headless else None,
            stderr=subprocess.DEVNULL if headless else None,
            env=environment, creationflags=flags,
        )

    deadline = time.monotonic() + 8.0
    while time.monotonic() < deadline and _health() is None:
        if _PROCESS and _PROCESS.poll() is not None:
            break
        time.sleep(0.12)
    with _LOCK:
        payload = _status("Piano Auto Player started." if _health() else "Piano Auto Player is starting.")
        if _PROCESS and _PROCESS.poll() is not None and not payload["running"]:
            payload.update(ok=False, state="error", message="Piano Auto Player exited before becoming ready.")
        return payload


def stop_server(*, persist: bool = True) -> dict:
    global _PROCESS
    with _LOCK:
        if persist:
            _write_desired(False)
        verified = _health() is not None
        stopped = False
        if verified:
            for pid in _pids():
                stopped = _terminate(pid) or stopped
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
    deadline = time.monotonic() + 2.5
    while time.monotonic() < deadline and _health() is not None:
        time.sleep(0.1)
    with _LOCK:
        payload = _status("Piano Auto Player stopped." if stopped else "Piano Auto Player was already stopped.")
        if payload["running"]:
            payload.update(ok=False, state="error", message="Piano Auto Player did not stop cleanly.")
        return payload


def restore_desired_state_async() -> None:
    if not _desired():
        return
    threading.Thread(
        target=lambda: start_server(persist=False), name="eveos-piano-restore", daemon=True,
    ).start()
