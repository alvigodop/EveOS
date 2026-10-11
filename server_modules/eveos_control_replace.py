"""Safe process replacement for EveOS Local Control.

The old control plane acknowledges the request first and then shuts itself down. A detached worker
waits for the loopback port to be released, starts a new control plane in scoped-restart mode, and
verifies the new instance/source fingerprint without touching any child-service process.
"""
from __future__ import annotations

import argparse
import http.client
import json
import os
import socket
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path


def _root() -> Path:
    return Path(__file__).resolve().parent.parent


def _artifact_path() -> Path:
    return _root() / "data" / "runtime" / "local-control-replace.json"


def _write_artifact(payload: dict) -> None:
    path = _artifact_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temporary.replace(path)


def _port_available(port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", int(port)))
        return True
    except OSError:
        return False


def _health(port: int, timeout: float = 0.8) -> dict | None:
    connection = None
    try:
        connection = http.client.HTTPConnection("127.0.0.1", int(port), timeout=timeout)
        connection.request("GET", "/api/control-plane/health", headers={"Connection": "close"})
        response = connection.getresponse()
        payload = json.loads(response.read(65536).decode("utf-8"))
        if response.status != 200 or payload.get("service") != "eveos-control-plane":
            return None
        return payload
    except (OSError, ValueError, UnicodeError, http.client.HTTPException):
        return None
    finally:
        if connection is not None:
            try:
                connection.close()
            except OSError:
                pass


def request_replacement(port: int, *, current_instance_id: str, current_source_fingerprint: str,
                        expected_source_fingerprint: str = "") -> dict:
    """Spawn only the detached handoff worker; the caller owns post-response shutdown."""
    try:
        port = int(port)
    except (TypeError, ValueError):
        return {"ok": False, "accepted": False, "message": "Local Control replacement requires its verified port."}
    if not 1 <= port <= 65535:
        return {"ok": False, "accepted": False, "message": "Local Control replacement received an invalid port."}
    current = _health(port)
    if not current or current.get("instanceId") != current_instance_id:
        return {"ok": False, "accepted": False,
                "message": "Local Control identity changed before replacement could be acknowledged."}
    if current_source_fingerprint and current.get("sourceFingerprint") != current_source_fingerprint:
        return {"ok": False, "accepted": False,
                "message": "Local Control source identity changed before replacement could be acknowledged."}

    operation_id = uuid.uuid4().hex
    expected = str(expected_source_fingerprint or "").strip()
    command = [
        sys.executable, "-m", "server_modules.eveos_control_replace", "--worker",
        "--port", str(port), "--old-instance", current_instance_id,
        "--expected-fingerprint", expected, "--operation", operation_id,
    ]
    environment = os.environ.copy()
    environment["PYTHONUNBUFFERED"] = "1"
    environment["PYTHONUTF8"] = "1"
    environment["PYTHONIOENCODING"] = "utf-8"
    flags = 0
    kwargs = {}
    if os.name == "nt":
        flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)
        kwargs["creationflags"] = flags
    else:
        kwargs["start_new_session"] = True
    try:
        subprocess.Popen(
            command, cwd=str(_root()), env=environment, stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kwargs,
        )
    except OSError as exc:
        return {"ok": False, "accepted": False, "message": f"Could not launch Local Control replacement worker: {exc}"}
    return {
        "ok": True,
        "accepted": True,
        "operationId": operation_id,
        "previousInstanceId": current_instance_id,
        "previousSourceFingerprint": current_source_fingerprint,
        "expectedSourceFingerprint": expected,
        "port": port,
        "controlPlaneStopping": True,
        "message": "Local Control replacement acknowledged; the verified replacement will start after this response.",
    }


def _launch_replacement(port: int) -> subprocess.Popen:
    code = "from server_modules.eveos_control_helper import main; raise SystemExit(main())"
    command = [sys.executable, "-c", code, str(port), "--scoped-restart"]
    environment = os.environ.copy()
    environment["PYTHONUNBUFFERED"] = "1"
    environment["PYTHONUTF8"] = "1"
    environment["PYTHONIOENCODING"] = "utf-8"
    flags = 0
    kwargs = {}
    # Preserve the current visibility policy as closely as possible: an explicit EVEOS_HEADLESS
    # remains authoritative; otherwise the replacement gets a normal console on Windows.
    headless = str(environment.get("EVEOS_HEADLESS", "")).strip().lower() in {"1", "true", "yes", "on"}
    if os.name == "nt":
        flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        flags |= getattr(subprocess, "CREATE_NO_WINDOW" if headless else "CREATE_NEW_CONSOLE", 0)
        kwargs["creationflags"] = flags
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen(
        command, cwd=str(_root()), env=environment, stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL if headless else None,
        stderr=subprocess.DEVNULL if headless else None, **kwargs,
    )


def run_worker(port: int, old_instance: str, expected_fingerprint: str, operation_id: str) -> int:
    evidence = {
        "operationId": operation_id,
        "port": int(port),
        "previousInstanceId": old_instance,
        "expectedSourceFingerprint": expected_fingerprint,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "ok": False,
        "stage": "waiting-for-old-control",
    }
    _write_artifact(evidence)
    deadline = time.monotonic() + 12.0
    while time.monotonic() < deadline:
        current = _health(port, 0.35)
        if current is None and _port_available(port):
            break
        if current and current.get("instanceId") != old_instance:
            evidence.update(stage="identity-changed-before-worker-launch", observed=current)
            _write_artifact(evidence)
            return 2
        time.sleep(0.15)
    else:
        evidence.update(stage="old-control-timeout", message="Old Local Control did not release its verified port.")
        _write_artifact(evidence)
        return 3

    evidence["stage"] = "starting-replacement"
    _write_artifact(evidence)
    try:
        process = _launch_replacement(port)
    except OSError as exc:
        evidence.update(stage="launch-failed", message=str(exc))
        _write_artifact(evidence)
        return 4

    deadline = time.monotonic() + 20.0
    last = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            evidence.update(stage="replacement-exited", exitCode=process.returncode)
            _write_artifact(evidence)
            return 5
        last = _health(port, 0.6)
        if last and last.get("instanceId") != old_instance:
            fingerprint_ok = not expected_fingerprint or last.get("sourceFingerprint") == expected_fingerprint
            scoped_ok = last.get("scopedStartup") is True
            if fingerprint_ok and scoped_ok:
                evidence.update(
                    ok=True, stage="ready", replacementInstanceId=last.get("instanceId"),
                    replacementSourceFingerprint=last.get("sourceFingerprint"), scopedStartup=True,
                    finishedAt=datetime.now(timezone.utc).isoformat(),
                )
                _write_artifact(evidence)
                return 0
        time.sleep(0.2)
    evidence.update(stage="verification-timeout", observed=last,
                    message="Replacement did not prove fresh identity/source within the bounded verification window.")
    _write_artifact(evidence)
    return 6


def main() -> int:
    parser = argparse.ArgumentParser(description="EveOS Local Control replacement worker")
    parser.add_argument("--worker", action="store_true")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--old-instance", default="")
    parser.add_argument("--expected-fingerprint", default="")
    parser.add_argument("--operation", default="")
    args = parser.parse_args()
    if not args.worker:
        return 2
    return run_worker(args.port, args.old_instance, args.expected_fingerprint, args.operation)


if __name__ == "__main__":
    raise SystemExit(main())
