#!/usr/bin/env python3
"""Contract smoke for detached Matrix native background-window control."""

from __future__ import annotations

import http.client
import http.server
import json
import socket
import sys
import threading
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules import eveos_control_helper as helper  # noqa: E402
from server_modules import matrix_window_control as matrix_control  # noqa: E402


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def post_json(port, body, origin="null"):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    try:
        encoded = json.dumps(body).encode("utf-8")
        connection.request("POST", "/api/matrix-window/control", body=encoded, headers={
            "Origin": origin,
            "Content-Type": "application/json",
            "Content-Length": str(len(encoded)),
            "Connection": "close",
        })
        response = connection.getresponse()
        return response.status, json.loads(response.read().decode("utf-8"))
    finally:
        connection.close()


def direct_contract():
    original = (
        matrix_control.is_supported,
        matrix_control._find_matrix_window,
        matrix_control._apply_window_lock,
        matrix_control._start_enforcement,
        matrix_control._stop_enforcement,
    )
    calls = []
    try:
        matrix_control.is_supported = lambda: True
        matrix_control._find_matrix_window = lambda token: (321, matrix_control.TITLE_PREFIX + token, 1)
        matrix_control._apply_window_lock = lambda hwnd, enabled: (
            calls.append(("apply", hwnd, enabled))
            or {
                "ok": True,
                "supported": True,
                "backgroundLocked": bool(enabled),
                "noActivateApplied": bool(enabled),
                "hwnd": hwnd,
            }
        )
        matrix_control._start_enforcement = lambda token, hwnd: calls.append(("start", token, hwnd))
        matrix_control._stop_enforcement = lambda token: calls.append(("stop", token)) or True

        bad = matrix_control.apply_request({"token": "../bad", "enabled": True})
        assert_true(bad.get("ok") is False, f"invalid token was accepted: {bad}")

        token = "abcDEF12_345"
        locked = matrix_control.apply_request({"token": token, "enabled": True})
        unlocked = matrix_control.apply_request({"token": token, "enabled": False})
        assert_true(
            locked.get("backgroundLocked") is True and locked.get("enforcement") == "continuous",
            f"continuous lock result mismatch: {locked}",
        )
        assert_true(
            unlocked.get("backgroundLocked") is False and unlocked.get("enforcement") == "off",
            f"unlock result mismatch: {unlocked}",
        )
        assert_true(calls == [
            ("apply", 321, True),
            ("start", token, 321),
            ("stop", token),
            ("apply", 321, False),
        ], f"native enforcement calls mismatch: {calls}")
    finally:
        (
            matrix_control.is_supported,
            matrix_control._find_matrix_window,
            matrix_control._apply_window_lock,
            matrix_control._start_enforcement,
            matrix_control._stop_enforcement,
        ) = original


def route_contract():
    original_apply = helper.matrix_window_control.apply_request
    calls = []
    helper.matrix_window_control.apply_request = lambda body: (
        calls.append(dict(body))
        or {
            "ok": True,
            "supported": True,
            "backgroundLocked": bool(body.get("enabled")),
            "enforcement": "continuous" if body.get("enabled") else "off",
        }
    )
    port = free_port()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), helper.EveOSControlHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        status, payload = post_json(port, {"token": "routeToken12", "enabled": True})
        assert_true(status == 200 and payload.get("backgroundLocked") is True,
                    f"local Matrix route failed: {status} {payload}")
        assert_true(calls == [{"token": "routeToken12", "enabled": True}],
                    f"Matrix route body mismatch: {calls}")

        forbidden_status, _ = post_json(
            port, {"token": "routeToken12", "enabled": False}, origin="https://example.com"
        )
        assert_true(forbidden_status == 403, "non-local origin was allowed to control Matrix window")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        helper.matrix_window_control.apply_request = original_apply


if __name__ == "__main__":
    direct_contract()
    route_contract()
    print("MATRIX_WINDOW_CONTROL_SMOKE_OK")
