#!/usr/bin/env python3
"""Loopback helper so file:// EveOS can start/stop Gemini without EveOS HTTP."""

from __future__ import annotations

import argparse
import http.server
import json
import os
import sys
from http import HTTPStatus
from urllib.parse import urlparse


SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SERVER_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server_modules import gemini_control, gemini_credentials  # noqa: E402


DEFAULT_PORT = 9082


class GeminiControlHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path in {"/api/status", "/status"}:
            self._send({"ok": True, "service": "gemini-control-helper", "port": self.server.server_port})
            return
        if path == "/api/gemini-server/status":
            self._send(gemini_control.get_status())
            return
        if path == "/api/gemini-credentials/status":
            if not gemini_control.request_can_control(self):
                self._send({"ok": False, "configured": False, "message": "Local access required."}, HTTPStatus.FORBIDDEN)
                return
            self._send(gemini_credentials.get_status())
            return
        self._send({"ok": False, "error": "Unknown endpoint"}, HTTPStatus.NOT_FOUND)

    def do_POST(self):
        path = urlparse(self.path).path
        if path in {"/api/gemini-server/start", "/api/gemini-server/stop"}:
            if not gemini_control.request_can_control(self):
                self._send({
                    "ok": False,
                    "controllerAvailable": True,
                    "state": "forbidden",
                    "running": False,
                    "message": "Gemini server control is limited to local EveOS pages."
                }, HTTPStatus.FORBIDDEN)
                return
            action = gemini_control.start_server if path.endswith("/start") else gemini_control.stop_server
            payload = action()
            self._send(payload, HTTPStatus.OK if payload.get("ok") else HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if path == "/api/gemini-credentials":
            if not gemini_control.request_can_control(self):
                self._send({"ok": False, "configured": False, "message": "Local access required."}, HTTPStatus.FORBIDDEN)
                return
            body = gemini_credentials.read_json_body(self)
            payload = gemini_credentials.save_api_key(body.get("apiKey", ""))
            self._send(payload, HTTPStatus.OK if payload.get("ok") else HTTPStatus.BAD_REQUEST)
            return
        self._send({"ok": False, "error": "Unknown endpoint"}, HTTPStatus.NOT_FOUND)

    def log_message(self, fmt, *args):
        print("[GeminiControlHelper] " + (fmt % args))

    def _send(self, payload: dict, status: int = HTTPStatus.OK):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    parser = argparse.ArgumentParser(description="EveOS Gemini file-mode control helper")
    parser.add_argument("port", nargs="?", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), GeminiControlHandler)
    print("[OK] Gemini file-mode control helper")
    print(f"  Local: http://127.0.0.1:{args.port}/api/gemini-server/status")
    print("  Press Ctrl+C to stop the helper")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[OK] Gemini control helper stopped")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
