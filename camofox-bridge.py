#!/usr/bin/env python3
"""
Standalone Camofox bridge for EveOS.

Starts the local camofox-browser server on demand and exposes a small CORS-safe
API that the file:// EveOS app can call directly.
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

from server_modules import camofox
from server_modules import proxy

DEFAULT_PORT = 3038

logging.basicConfig(
    level=logging.INFO,
    format="[CamofoxBridge] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("CamofoxBridge")


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

    def do_POST(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/api/proxy":
            proxy.handle_proxy_post_request(self, query)
            return

        if parsed.path == "/api/camofox":
            camofox.handle_camofox_fetch(self, query)
            return

        self.send_response(HTTPStatus.NOT_FOUND)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"error":"Unknown POST endpoint"}')

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/api/status":
            payload = {
                "status": "ok",
                "service": "camofox-bridge",
                "runtimeAvailable": bool(camofox.is_camofox_runtime_available()),
                "bridgePort": self.server.server_address[1],
                "serverPort": camofox.current_camofox_server_port(),
            }
            body = json.dumps(payload).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path == "/api/proxy":
            proxy.handle_proxy_request(self, query)
            return

        if parsed.path == "/api/camofox":
            camofox.handle_camofox_fetch(self, query)
            return

        self.send_response(HTTPStatus.NOT_FOUND)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"error":"Unknown GET endpoint"}')

    def log_message(self, fmt, *args):
        logger.info(fmt % args)


def run_server(port):
    project_root = os.path.dirname(os.path.abspath(__file__))
    os.environ.setdefault("EVEOS_PROJECT_ROOT", project_root)
    try:
        with ReusableThreadingTCPServer(("127.0.0.1", port), BridgeHandler) as httpd:
            print("[OK] EveOS Camofox Standalone Bridge")
            print("  ------------------------------")
            print(f"  Local:   http://127.0.0.1:{port}/api/camofox?url=...")
            print(f"  Status:  http://127.0.0.1:{port}/api/status")
            print(f"  Runtime: {camofox._runtime_root()}")
            print("  ------------------------------")
            print("  Press Ctrl+C to stop the bridge")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[OK] Camofox bridge stopped")
        return 0
    except Exception as exc:
        print(f"[ERROR] Camofox bridge failed: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EveOS standalone Camofox bridge")
    parser.add_argument("port", nargs="?", type=int, default=DEFAULT_PORT, help=f"HTTP port (default: {DEFAULT_PORT})")
    args = parser.parse_args()
    sys.exit(run_server(args.port))
