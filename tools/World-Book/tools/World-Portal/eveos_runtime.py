"""Small EveOS host contract for the otherwise standalone World Portal server."""

from __future__ import annotations

import json
import contextlib
import socket
import urllib.parse


class EveOSPortalMixin:
    """Expose a verified loopback health route without coupling Portal to EveOS internals."""

    def _eveos_origin(self) -> str:
        origin = str(self.headers.get("Origin") or "")
        if origin == "null":
            return origin
        parsed = urllib.parse.urlparse(origin)
        if parsed.scheme in {"http", "https"} and parsed.hostname in {
            "127.0.0.1", "localhost", "::1"
        }:
            return origin
        return ""

    def _eveos_health(self) -> bool:
        if urllib.parse.urlparse(self.path).path != "/api/health":
            return False
        body = json.dumps({
            "ok": True,
            "service": "world-portal",
            "appVersion": self.portal_app_version(),
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return True

    def do_OPTIONS(self) -> None:  # noqa: N802
        if urllib.parse.urlparse(self.path).path != "/api/health" or not self._eveos_origin():
            self.send_response(403)
        else:
            self.send_response(204)
        self.end_headers()

    def end_headers(self) -> None:
        if urllib.parse.urlparse(self.path).path == "/api/health":
            origin = self._eveos_origin()
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.send_header("Vary", "Origin")
        super().end_headers()


def choose_listening_port(host: str, preferred: int, strict: bool = False) -> int:
    def available(port: int) -> bool:
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as probe:
            probe.settimeout(0.25)
            return probe.connect_ex((host, port)) != 0

    if available(preferred):
        return preferred
    if strict:
        raise SystemExit(f"World Portal port {preferred} is already in use.")
    for port in range(preferred + 1, preferred + 31):
        if available(port):
            return port
    raise RuntimeError("No free local port found.")
