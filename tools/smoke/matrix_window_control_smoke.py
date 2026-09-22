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
        matrix_control._set_taskbar_autohide,
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
                "appWindowApplied": True,
                "hwnd": hwnd,
            }
        )
        matrix_control._start_enforcement = lambda token, hwnd: calls.append(("start", token, hwnd))
        matrix_control._stop_enforcement = lambda token: calls.append(("stop", token)) or True
        matrix_control._set_taskbar_autohide = lambda token, hwnd, enabled: (
            calls.append(("taskbar", token, hwnd, enabled))
            or {
                "ok": True,
                "supported": True,
                "taskbarAutoHide": bool(enabled),
                "edgeGuard": bool(enabled),
            }
        )

        bad = matrix_control.apply_request({"token": "../bad", "enabled": True})
        assert_true(bad.get("ok") is False, f"invalid token was accepted: {bad}")

        token = "abcDEF12_345"
        locked = matrix_control.apply_request({
            "token": token, "action": "background-lock", "enabled": True
        })
        unlocked = matrix_control.apply_request({
            "token": token, "action": "background-lock", "enabled": False
        })
        taskbar_on = matrix_control.apply_request({
            "token": token, "action": "immersive-taskbar", "enabled": True
        })
        taskbar_off = matrix_control.apply_request({
            "token": token, "action": "immersive-taskbar", "enabled": False
        })

        assert_true(
            locked.get("backgroundLocked") is True
            and locked.get("enforcement") == "continuous"
            and locked.get("appWindowApplied") is True,
            f"continuous lock result mismatch: {locked}",
        )
        assert_true(
            unlocked.get("backgroundLocked") is False and unlocked.get("enforcement") == "off",
            f"unlock result mismatch: {unlocked}",
        )
        assert_true(
            taskbar_on.get("taskbarAutoHide") is True and taskbar_on.get("edgeGuard") is True,
            f"taskbar enable mismatch: {taskbar_on}",
        )
        assert_true(taskbar_off.get("taskbarAutoHide") is False,
                    f"taskbar restore mismatch: {taskbar_off}")
        assert_true(calls == [
            ("apply", 321, True),
            ("start", token, 321),
            ("stop", token),
            ("apply", 321, False),
            ("taskbar", token, 321, True),
            ("taskbar", token, None, False),
        ], f"native control calls mismatch: {calls}")
    finally:
        (
            matrix_control.is_supported,
            matrix_control._find_matrix_window,
            matrix_control._apply_window_lock,
            matrix_control._start_enforcement,
            matrix_control._stop_enforcement,
            matrix_control._set_taskbar_autohide,
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
        }
    )
    port = free_port()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), helper.EveOSControlHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        body = {"token": "routeToken12", "action": "background-lock", "enabled": True}
        status, payload = post_json(port, body)
        assert_true(status == 200 and payload.get("backgroundLocked") is True,
                    f"local Matrix route failed: {status} {payload}")
        assert_true(calls == [body], f"Matrix route body mismatch: {calls}")

        forbidden_status, _ = post_json(
            port, body, origin="https://example.com"
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
