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
    original_supported = matrix_control.is_supported
    original_find = matrix_control._find_matrix_window
    original_apply = matrix_control._apply_window_lock
    calls = []
    try:
        matrix_control.is_supported = lambda: True
        matrix_control._find_matrix_window = lambda token: (321, matrix_control.TITLE_PREFIX + token, 1)
        matrix_control._apply_window_lock = lambda hwnd, enabled: (
            calls.append((hwnd, enabled))
            or {"ok": True, "supported": True, "backgroundLocked": bool(enabled), "hwnd": hwnd}
        )

        bad = matrix_control.apply_request({"token": "../bad", "enabled": True})
        assert_true(bad.get("ok") is False, f"invalid token was accepted: {bad}")

        locked = matrix_control.apply_request({"token": "abcDEF12_345", "enabled": True})
        unlocked = matrix_control.apply_request({"token": "abcDEF12_345", "enabled": False})
        assert_true(locked.get("backgroundLocked") is True, f"lock result mismatch: {locked}")
        assert_true(unlocked.get("backgroundLocked") is False, f"unlock result mismatch: {unlocked}")
        assert_true(calls == [(321, True), (321, False)], f"native adapter calls mismatch: {calls}")
    finally:
        matrix_control.is_supported = original_supported
        matrix_control._find_matrix_window = original_find
        matrix_control._apply_window_lock = original_apply


def route_contract():
    original_apply = helper.matrix_window_control.apply_request
    calls = []
    helper.matrix_window_control.apply_request = lambda body: (
        calls.append(dict(body))
        or {"ok": True, "supported": True, "backgroundLocked": bool(body.get("enabled"))}
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
