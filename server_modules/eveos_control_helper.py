"""General loopback control plane for file:// and localhost EveOS surfaces."""

from __future__ import annotations

import argparse
import http.server
import json
import time
from http import HTTPStatus
from urllib.parse import urlparse
from urllib.request import urlopen

from . import eveos_web_control
from . import gemini_control
from . import gemini_credentials
from . import world_book_control
from .eveos_http_cors import eveos_cors_origin


DEFAULT_PORT = 9082


def wait_for_control(port: int, timeout: float) -> int:
    """Wait for this control plane, rejecting unrelated loopback services."""
    deadline = time.monotonic() + max(0.1, timeout)
    url = f"http://127.0.0.1:{port}/api/control-plane/health"
    while time.monotonic() < deadline:
        try:
            with urlopen(url, timeout=min(1.0, max(0.1, deadline - time.monotonic()))) as response:
                payload = json.load(response)
            if payload.get("service") == "eveos-control-plane":
                return 0
        except (OSError, ValueError, json.JSONDecodeError):
            pass
        time.sleep(0.2)
    return 1


class EveOSControlHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        origin = eveos_cors_origin(self.headers.get("Origin"))
        if origin is not None:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path in {"/api/health", "/api/control-plane/health"}:
            self._send(
                {
                    "ok": True,
                    "service": "eveos-control-plane",
                    "controllerAvailable": True,
                    "state": "running",
                    "running": True,
                    "port": self.server.server_port,
                }
            )
            return
        if path in {"/api/status", "/status", "/api/control-plane/status"}:
            web = eveos_web_control.get_status()
            self._send(
                {
                    "ok": True,
                    "service": "eveos-control-plane",
                    "controllerAvailable": True,
                    "state": "running",
                    "running": True,
                    "port": self.server.server_port,
                    "web": web,
                    "message": "EveOS local control is ready.",
                }
            )
            return
        if path == "/api/eveos-server/status":
            self._send(eveos_web_control.get_status())
            return
        if path == "/api/gemini-server/status":
            self._send(gemini_control.get_status())
            return
        if path == "/api/world-book/status":
            self._send(world_book_control.get_status())
            return
        if path == "/api/gemini-credentials/status":
            if not gemini_control.request_can_control(self):
                self._send(
                    {"ok": False, "configured": False, "message": "Local access required."},
                    HTTPStatus.FORBIDDEN,
                )
                return
            self._send(gemini_credentials.get_status())
            return
        self._send({"ok": False, "error": "Unknown endpoint"}, HTTPStatus.NOT_FOUND)

    def do_POST(self):
        path = urlparse(self.path).path
        if path in {
            "/api/eveos-server/start",
            "/api/eveos-server/stop",
            "/api/gemini-server/start",
            "/api/gemini-server/stop",
            "/api/world-book/start",
            "/api/world-book/stop",
            "/api/gemini-credentials",
        } and not gemini_control.request_can_control(self):
            self._send(
                {
                    "ok": False,
                    "controllerAvailable": True,
                    "state": "forbidden",
                    "running": False,
                    "message": "Lifecycle control is limited to local EveOS pages.",
                },
                HTTPStatus.FORBIDDEN,
            )
            return

        action = None
        if path == "/api/eveos-server/start":
            action = eveos_web_control.start_server
        elif path == "/api/eveos-server/stop":
            action = eveos_web_control.stop_server
        elif path == "/api/gemini-server/start":
            action = gemini_control.start_server
        elif path == "/api/gemini-server/stop":
            action = gemini_control.stop_server
        elif path == "/api/world-book/start":
            action = world_book_control.start_server
        elif path == "/api/world-book/stop":
            action = world_book_control.stop_server

        if action is not None:
            payload = action()
            self._send(payload, HTTPStatus.OK if payload.get("ok") else HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if path == "/api/gemini-credentials":
            body = gemini_credentials.read_json_body(self)
            payload = gemini_credentials.save_api_key(body.get("apiKey", ""))
            self._send(payload, HTTPStatus.OK if payload.get("ok") else HTTPStatus.BAD_REQUEST)
            return
        self._send({"ok": False, "error": "Unknown endpoint"}, HTTPStatus.NOT_FOUND)

    def log_message(self, fmt, *args):
        print("[EveOSControl] " + (fmt % args))

    def _send(self, payload: dict, status: int = HTTPStatus.OK):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    parser = argparse.ArgumentParser(description="EveOS file-mode local control plane")
    parser.add_argument("port", nargs="?", type=int, default=DEFAULT_PORT)
    parser.add_argument("--probe", action="store_true", help="Wait for a verified control plane and exit")
    parser.add_argument("--timeout", type=float, default=30.0, help="Probe timeout in seconds")
    args = parser.parse_args()
    if args.probe:
        return wait_for_control(args.port, args.timeout)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), EveOSControlHandler)
    print("[OK] EveOS local control plane")
    print(f"  Control: http://127.0.0.1:{args.port}/api/control-plane/status")
    print("  Manages EveOS localhost, Gemini, and World Book independently.")
    print("  Press Ctrl+C to stop the control plane")
    eveos_web_control.restore_desired_state_async()
    world_book_control.restore_desired_state_async()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[OK] EveOS local control plane stopped")
    finally:
        server.server_close()
    return 0
