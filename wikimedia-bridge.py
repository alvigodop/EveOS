#!/usr/bin/env python3
"""
Standalone Wikimedia bridge for EveOS.

Provides a small CORS-safe local service that keeps Wikimedia/Wikipedia requests
policy-compliant while the UI itself still runs from file://.
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

from server_modules import proxy
from server_modules import wikipedia

DEFAULT_PORT = 3039

logging.basicConfig(
    level=logging.INFO,
    format="[WikimediaBridge] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("WikimediaBridge")


def _extract_target_url(query):
    target = query.get("url")
    if not target:
        return ""
    return str(target[0] or "").strip()


def _is_allowed_target(target_url):
    return bool(target_url) and proxy._is_wikimedia_request(target_url)


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
            target_url = _extract_target_url(query)
            if not _is_allowed_target(target_url):
                self._send_target_error(target_url)
                return
            proxy.handle_proxy_post_request(self, query)
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
                "service": "wikimedia-bridge",
                "bridgePort": self.server.server_address[1],
                "scope": ["wikipedia.org", "wikimedia.org"],
                "userAgent": proxy.WMF_USER_AGENT,
            }
            body = json.dumps(payload).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path == "/api/proxy":
            target_url = _extract_target_url(query)
            if not _is_allowed_target(target_url):
                self._send_target_error(target_url)
                return
            proxy.handle_proxy_request(self, query)
            return

        if parsed.path == "/api/wikipedia/search":
            wikipedia.handle_wikipedia_search(self, query)
            return

        self.send_response(HTTPStatus.NOT_FOUND)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"error":"Unknown GET endpoint"}')

    def _send_target_error(self, target_url):
        self.send_response(HTTPStatus.FORBIDDEN)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        body = json.dumps({
            "error": "Wikimedia bridge only proxies wikipedia.org and wikimedia.org targets",
            "url": target_url,
        }).encode("utf-8")
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        logger.info(fmt % args)


def run_server(port):
    project_root = os.path.dirname(os.path.abspath(__file__))
    os.environ.setdefault("EVEOS_PROJECT_ROOT", project_root)
    try:
        with ReusableThreadingTCPServer(("127.0.0.1", port), BridgeHandler) as httpd:
            print("[OK] EveOS Wikimedia Standalone Bridge")
            print("  ------------------------------")
            print(f"  Local:   http://127.0.0.1:{port}/api/proxy?url=...")
            print(f"  Search:  http://127.0.0.1:{port}/api/wikipedia/search?q=...")
            print(f"  Status:  http://127.0.0.1:{port}/api/status")
            print("  Scope:   wikipedia.org + wikimedia.org only")
            print("  ------------------------------")
            print("  Press Ctrl+C to stop the bridge")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[OK] Wikimedia bridge stopped")
        return 0
    except Exception as exc:
        print(f"[ERROR] Wikimedia bridge failed: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EveOS standalone Wikimedia bridge")
    parser.add_argument("port", nargs="?", type=int, default=DEFAULT_PORT, help=f"HTTP port (default: {DEFAULT_PORT})")
    args = parser.parse_args()
    sys.exit(run_server(args.port))
