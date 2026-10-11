#!/usr/bin/env python3
"""Qualify the CLI probe without importing or mutating real service runtimes."""

from __future__ import annotations

import http.server
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "data" / "runtime" / "smoke-results" / "eveos-control-probe.json"
DIAGNOSTICS = {"python": sys.executable, "version": sys.version, "cases": []}


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def probe_fixture(root: Path):
    (root / "server").mkdir()
    (root / "server_modules").mkdir()
    (root / "config").mkdir()
    for relative in (
        "server/eveos-control-helper.py", "server_modules/__init__.py",
        "server_modules/eveos_ports.py", "server_modules/eveos_control_probe.py",
        "config/eveos-ports.json",
    ):
        shutil.copyfile(ROOT / relative, root / relative)
    (root / "server_modules" / "eveos_control_helper.py").write_text(
        'raise AssertionError("probe imported the full control runtime")\n', encoding="utf-8",
    )
    (root / "server_modules" / "eveos_update_plan.py").write_text(
        'raise AssertionError("probe imported the source fingerprint scanner")\n', encoding="utf-8",
    )
    baseline = root / "data" / "runtime" / "eveos-update-baseline.json"
    baseline.parent.mkdir(parents=True)
    baseline.write_bytes(b"protected probe fixture baseline\n")
    return baseline


def cli_probe(root: Path, port: int, case: str, expected: int, timeout: float):
    command = [sys.executable, str(root / "server" / "eveos-control-helper.py"),
               str(port), "--probe", "--timeout", str(timeout)]
    record = {"id": case, "command": command, "expectedExit": expected}
    DIAGNOSTICS["cases"].append(record)
    started = time.monotonic()
    try:
        result = subprocess.run(command, cwd=root, capture_output=True, text=True,
                                timeout=4, check=False)
    except subprocess.TimeoutExpired as exc:
        record.update(elapsed=time.monotonic() - started, timedOut=4,
                      stdout=str(exc.stdout or ""), stderr=str(exc.stderr or ""))
        raise AssertionError(f"{case}: CLI exceeded the unchanged 4-second process bound") from exc
    record.update(elapsed=time.monotonic() - started, exit=result.returncode,
                  stdout=result.stdout, stderr=result.stderr)
    check(result.returncode == expected, f"{case}: expected exit {expected}, got {result.returncode}")
    if expected:
        check(timeout <= record["elapsed"] < timeout + 0.8,
              f"{case}: configured {timeout}s probe deadline took {record['elapsed']:.3f}s")


def main():
    state = {"service": "eveos-control-plane", "delayBody": 0.0,
             "trickleBody": 0.0, "trickleHeaders": 0.0}

    class Health(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            check(self.path == "/api/control-plane/health", "probe used a detailed status route")
            body = json.dumps({"service": state["service"]}).encode()
            delay = state["delayBody"]
            body_interval, header_interval = state["trickleBody"], state["trickleHeaders"]
            try:
                if header_interval:
                    headers = f"HTTP/1.0 200 OK\r\nContent-Length: {len(body)}\r\n\r\n".encode()
                    for value in headers:
                        self.wfile.write(bytes([value]))
                        self.wfile.flush()
                        time.sleep(header_interval)
                else:
                    self.send_response(200)
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                if delay:
                    time.sleep(delay)
                if body_interval:
                    for value in body:
                        self.wfile.write(bytes([value]))
                        self.wfile.flush()
                        time.sleep(body_interval)
                else:
                    self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass  # The bounded probe has already closed its timed-out fixture socket.

        def log_message(self, *_args):
            pass

    fixture = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Health)
    fixture.daemon_threads = True
    thread = threading.Thread(target=fixture.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix="eveos-probe-smoke-") as temp:
            root = Path(temp)
            baseline = probe_fixture(root)
            before = baseline.read_bytes(), baseline.stat().st_mtime_ns
            cli_probe(root, fixture.server_port, "ready-health", 0, 2.0)
            state["service"] = "foreign-service"
            cli_probe(root, fixture.server_port, "wrong-service-deadline", 1, 0.2)
            state.update(service="eveos-control-plane", delayBody=1.0)
            cli_probe(root, fixture.server_port, "stalled-body-deadline", 1, 0.2)
            state.update(delayBody=0.0, trickleBody=0.03)
            cli_probe(root, fixture.server_port, "trickled-branded-body-deadline", 1, 0.2)
            state.update(trickleBody=0.0, trickleHeaders=0.01)
            cli_probe(root, fixture.server_port, "trickled-headers-deadline", 1, 0.2)
            check((baseline.read_bytes(), baseline.stat().st_mtime_ns) == before,
                  "probe rewrote the isolated source update baseline")
            DIAGNOSTICS["baselineUnchanged"] = True
    finally:
        fixture.shutdown()
        fixture.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        DIAGNOSTICS["failure"] = f"{type(exc).__name__}: {exc}"
        print(f"EVEOS_CONTROL_PROBE_SMOKE_FAIL: {exc}; diagnostics: {ARTIFACT}", file=sys.stderr)
        raise SystemExit(1)
    else:
        print("EVEOS_CONTROL_PROBE_SMOKE_OK checks=6")
    finally:
        ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
        ARTIFACT.write_text(json.dumps(DIAGNOSTICS, indent=2), encoding="utf-8")
