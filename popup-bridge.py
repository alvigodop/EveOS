#!/usr/bin/env python3
"""
Standalone popup bridge for EveOS.

This is the lightweight path for reliable in-site popup rendering from file://
without requiring the heavier Lightpanda or Camofox bridges.
"""

import argparse
import errno
import http.server
import json
import logging
import os
import socketserver
import sys
from http import HTTPStatus
from urllib.parse import parse_qs, urlparse

from server_modules import popup_viewer

DEFAULT_PORT = 3040
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(PROJECT_ROOT, "bin")
LOG_PATH = os.path.join(LOG_DIR, "popup_activity.log")

os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="[PopupBridge] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
    ],
)
logger = logging.getLogger("PopupBridge")


class ReusableThreadingTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        exc_type, exc, _tb = sys.exc_info()
        if isinstance(exc, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
            logger.info("Client disconnected: %s", client_address)
            return
        if isinstance(exc, OSError):
            if getattr(exc, "winerror", None) in (10053, 10054):
                logger.info("Client disconnected: %s", client_address)
                return
            if exc.errno in (errno.EPIPE, errno.ECONNRESET, errno.ECONNABORTED):
                logger.info("Client disconnected: %s", client_address)
                return
        super().handle_error(request, client_address)


class BridgeHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/api/status":
            body = json.dumps({
                "status": "ok",
                "service": "popup-bridge",
                "bridgePort": self.server.server_address[1],
                "scope": "External http(s) targets excluding localhost/private networks",
            }).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path == "/api/popup-view":
            popup_viewer.handle_popup_view(self, query)
            return

        if parsed.path == "/api/popup-resource":
            popup_viewer.handle_popup_resource_request(self, query)
            return

        self.send_response(HTTPStatus.NOT_FOUND)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"error":"Unknown GET endpoint"}')

    def do_POST(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/api/popup-resource":
            popup_viewer.handle_popup_resource_request(self, query)
            return

        self.send_response(HTTPStatus.NOT_FOUND)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"error":"Unknown POST endpoint"}')

    def log_message(self, fmt, *args):
        logger.info(fmt % args)


def run_server(port):
    os.environ.setdefault("EVEOS_PROJECT_ROOT", PROJECT_ROOT)
    try:
        with ReusableThreadingTCPServer(("127.0.0.1", port), BridgeHandler) as httpd:
            print("[OK] EveOS Popup Standalone Bridge")
            print("  ------------------------------")
            print(f"  View:    http://127.0.0.1:{port}/api/popup-view?url=...")
            print(f"  Proxy:   http://127.0.0.1:{port}/api/popup-resource?url=...")
            print(f"  Status:  http://127.0.0.1:{port}/api/status")
            print("  Scope:   External http(s) sites only; localhost/private targets denied")
            print("  ------------------------------")
            print("  Press Ctrl+C to stop the bridge")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[OK] Popup bridge stopped")
        return 0
    except Exception as exc:
        print(f"[ERROR] Popup bridge failed: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EveOS standalone popup bridge")
    parser.add_argument("port", nargs="?", type=int, default=DEFAULT_PORT, help=f"HTTP port (default: {DEFAULT_PORT})")
    args = parser.parse_args()
    sys.exit(run_server(args.port))
