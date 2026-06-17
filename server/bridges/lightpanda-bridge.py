#!/usr/bin/env python3
"""
Standalone Lightpanda bridge for EveOS.

Exposes only the Lightpanda endpoints needed by the HTML app so the user can
run it on demand without the full EveOS backend.
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

BRIDGE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.dirname(BRIDGE_DIR)
PROJECT_ROOT = os.path.dirname(SERVER_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server_modules import lightpanda
from server_modules import proxy

DEFAULT_PORT = 3037

logging.basicConfig(
    level=logging.INFO,
    format="[LightpandaBridge] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("LightpandaBridge")


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

        if parsed.path == "/api/lightpanda":
            # Note: handle_lightpanda_fetch currently ignores POST body, 
            # but we allow the call.
            lightpanda.handle_lightpanda_fetch(self, query)
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
                "service": "lightpanda-bridge",
                "lightpandaAvailable": bool(lightpanda.is_lightpanda_available()),
                "port": self.server.server_address[1],
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

        if parsed.path == "/api/lightpanda":
            lightpanda.handle_lightpanda_fetch(self, query)
            return

        self.send_response(HTTPStatus.NOT_FOUND)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"error":"Unknown GET endpoint"}')

    def log_message(self, fmt, *args):
        logger.info(fmt % args)


def run_server(port):
    os.environ.setdefault("EVEOS_PROJECT_ROOT", PROJECT_ROOT)
    try:
        with ReusableThreadingTCPServer(("127.0.0.1", port), BridgeHandler) as httpd:
            print("[OK] EveOS Lightpanda Standalone Bridge")
            print("  ------------------------------")
            print(f"  Local:   http://127.0.0.1:{port}/api/lightpanda?url=...")
            print(f"  Status:  http://127.0.0.1:{port}/api/status")
            print(f"  Binary:  {lightpanda._lightpanda_binary_path()}")
            print("  ------------------------------")
            print("  Press Ctrl+C to stop the bridge")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[OK] Lightpanda bridge stopped")
        return 0
    except Exception as exc:
        print(f"[ERROR] Lightpanda bridge failed: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EveOS standalone Lightpanda bridge")
    parser.add_argument("port", nargs="?", type=int, default=DEFAULT_PORT, help=f"HTTP port (default: {DEFAULT_PORT})")
    args = parser.parse_args()
    sys.exit(run_server(args.port))
