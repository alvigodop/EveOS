"""Persisted lifecycle control for the canonical EveOS localhost surface."""

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


EVEOS_WEB_PORT = int(os.environ.get("EVEOS_WEB_PORT") or 8765)
_PROCESS = None
_LOCK = threading.RLock()


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _entry_point() -> Path:
    return _project_root() / "server" / "python-server.py"


def _preference_path() -> Path:
    return _project_root() / "data" / "runtime" / "eveos-web-service.json"


def _read_desired_state() -> bool:
    try:
        payload = json.loads(_preference_path().read_text(encoding="utf-8"))
        return payload.get("desiredRunning") is True
    except (OSError, ValueError, TypeError):
        return False


def _write_desired_state(enabled: bool) -> None:
    path = _preference_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(
            {
                "desiredRunning": bool(enabled),
                "port": EVEOS_WEB_PORT,
                "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    temporary.replace(path)


def _port_open() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", EVEOS_WEB_PORT), timeout=0.25):
            return True
    except OSError:
        return False


def _health_payload() -> dict | None:
    connection = None
    try:
        connection = http.client.HTTPConnection("127.0.0.1", EVEOS_WEB_PORT, timeout=0.8)
        connection.request("GET", "/api/status", headers={"Connection": "close"})
        response = connection.getresponse()
        body = response.read(65536)
        if response.status != 200:
            return None
        payload = json.loads(body.decode("utf-8"))
        if payload.get("ok") is not True or payload.get("service") != "eveos-local-server":
            return None
        return payload
    except (OSError, ValueError, UnicodeError):
        return None
    finally:
        if connection is not None:
            try:
                connection.close()
            except OSError:
                pass


def _listener_pids() -> list[int]:
    if os.name == "nt":
        result = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            capture_output=True,
            text=True,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        marker = f":{EVEOS_WEB_PORT}"
        pids = set()
        for line in (result.stdout or "").splitlines():
            if marker not in line or "LISTENING" not in line.upper():
                continue
            fields = line.split()
            if fields and fields[-1].isdigit():
                pids.add(int(fields[-1]))
        return sorted(pids)

    result = subprocess.run(
        ["lsof", "-nP", f"-iTCP:{EVEOS_WEB_PORT}", "-sTCP:LISTEN", "-t"],
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


def _status(message: str = "") -> dict:
    global _PROCESS
    health = _health_payload()
    process_alive = bool(_PROCESS and _PROCESS.poll() is None)
    running = health is not None
    port_busy = _port_open() and not running
    installed = _entry_point().is_file()
    state = "running" if running else ("starting" if process_alive else ("blocked" if port_busy else "stopped"))
    return {
        "ok": not port_busy and installed,
        "controllerAvailable": True,
        "installed": installed,
        "state": state,
        "running": running,
        "desiredRunning": _read_desired_state(),
        "port": EVEOS_WEB_PORT,
        "url": f"http://127.0.0.1:{EVEOS_WEB_PORT}/EveOS.html",
        "pids": _listener_pids() if running else [],
        "message": message
        or (
            "EveOS localhost is online."
            if running
            else "The EveOS web port is occupied by another service."
            if port_busy
            else "EveOS localhost is stopped."
        ),
    }


def get_status() -> dict:
    with _LOCK:
        return _status()


def start_server(*, persist: bool = True) -> dict:
    global _PROCESS
    with _LOCK:
        if persist:
            _write_desired_state(True)

        current = _status()
        if current["running"]:
            current["message"] = "EveOS localhost is already online."
            return current
        if current["state"] == "blocked":
            current["ok"] = False
            return current

        entry = _entry_point()
        if not entry.is_file():
            return {
                **current,
                "ok": False,
                "state": "error",
                "message": f"EveOS server entry point was not found: {entry}",
            }

        log_root = _project_root() / "data" / "runtime" / "logs"
        log_root.mkdir(parents=True, exist_ok=True)
        environment = os.environ.copy()
        environment["PYTHONUNBUFFERED"] = "1"
        environment["PYTHONUTF8"] = "1"
        environment["PYTHONIOENCODING"] = "utf-8"
        environment["EVEOS_WEB_PORT"] = str(EVEOS_WEB_PORT)
        flags = 0
        if os.name == "nt":
            flags = (
                getattr(subprocess, "CREATE_NO_WINDOW", 0)
                | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            )
        with (
            (log_root / "eveos-web.out.log").open("ab") as stdout_log,
            (log_root / "eveos-web.err.log").open("ab") as stderr_log,
        ):
            _PROCESS = subprocess.Popen(
                [sys.executable, str(entry), str(EVEOS_WEB_PORT), "--no-browser"],
                cwd=str(_project_root()),
                stdin=subprocess.DEVNULL,
                stdout=stdout_log,
                stderr=stderr_log,
                env=environment,
                creationflags=flags,
            )

    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        if _health_payload() is not None:
            break
        if _PROCESS and _PROCESS.poll() is not None:
            break
        time.sleep(0.12)

    with _LOCK:
        payload = _status("EveOS localhost started." if _health_payload() else "EveOS localhost is starting.")
        if _PROCESS and _PROCESS.poll() is not None and not payload["running"]:
            payload.update(ok=False, state="error", message="EveOS localhost exited before becoming ready.")
        return payload


def stop_server(*, persist: bool = True) -> dict:
    global _PROCESS
    with _LOCK:
        if persist:
            _write_desired_state(False)
        verified_server = _health_payload() is not None
        stopped = False

        # Never terminate an unknown listener merely because it owns the configured port.
        if verified_server:
            for pid in _listener_pids():
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

    deadline = time.monotonic() + 2.5
    while time.monotonic() < deadline and _health_payload() is not None:
        time.sleep(0.1)

    with _LOCK:
        payload = _status("EveOS localhost stopped." if stopped else "EveOS localhost was already stopped.")
        if payload["running"]:
            payload.update(ok=False, state="error", message="EveOS localhost did not stop cleanly.")
        return payload


def restore_desired_state() -> None:
    if not _read_desired_state():
        return
    payload = start_server(persist=False)
    print(f"[EveOS Web] {payload.get('message', 'Restore complete.')}")


def restore_desired_state_async() -> None:
    threading.Thread(
        target=restore_desired_state,
        name="eveos-web-restore",
        daemon=True,
    ).start()
