"""General loopback control plane for file:// and localhost EveOS surfaces."""

from __future__ import annotations

import argparse
import http.server
import json
import os
import threading
import time
from http import HTTPStatus
from urllib.parse import urlparse
from urllib.request import urlopen

from . import eveos_console_prefs
from . import eveos_web_control
from . import gemini_control
from . import gemini_credentials
from . import world_book_control
from .eveos_http_cors import eveos_cors_origin


DEFAULT_PORT = 9082
# Set once serve_forever() owns it, so a request can ask the plane to stop serving.
_SERVER = None


def _shutdown_plane_after_response(delay: float = 0.4) -> bool:
    """Stop the control plane itself, once the current response has had time to flush.

    Stop is meant to leave nothing running, and the plane's own console staying open after it read
    as "the stop did not work". shutdown() must not be called from the thread inside serve_forever,
    and it would also kill the reply mid-write, so it runs on a short timer from the handler thread.

    Consequence worth knowing: the file:// page cannot start anything again until the plane is back
    (sign-in with autostart installed, or tools\\batch\\start-eveos-control.bat).
    """
    if _SERVER is None:
        return False
    threading.Timer(delay, _SERVER.shutdown).start()
    return True


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


def _console_preferences() -> dict:
    """Console preferences alone, with no lifecycle probing.

    Flipping a console switch cannot start or stop anything, so answering it with a full overview
    means paying ~1.7s of netstat and health probes to return facts that provably did not change.
    That delay is what made a toggle look like it had not worked: the switch moved, nothing else
    did, and the panel only caught up seconds later.
    """
    prefs = eveos_console_prefs.read_all()
    return {
        "ok": True,
        "default": prefs["default"],
        "envForced": bool(str(os.environ.get("EVEOS_HEADLESS", "")).strip()),
        "preferencesOnly": True,
        "services": [
            {
                "key": key,
                "headless": eveos_console_prefs.headless_for(key),
                "overridden": key in prefs["services"],
            }
            for key in eveos_console_prefs.KNOWN_SERVICES
        ],
    }


def _console_overview() -> dict:
    """What is running, on which port, and whether it shows a console.

    One payload so the settings panel is a single request: asking three lifecycle endpoints and a
    preferences file separately would let the list render half-stale, which is exactly the kind of
    "is that actually running?" doubt this panel exists to remove.

    Costs roughly two seconds -- a netstat sweep and three health probes -- so it belongs on the
    panel opening, not on every switch. See _console_preferences for the cheap path.
    """
    prefs = eveos_console_prefs.read_all()
    services = []
    for key, label, status_fn, ports in (
        ("web", "EveOS localhost", eveos_web_control.get_status,
         lambda s: [s.get("port")]),
        ("gemini", "Gemini backend", gemini_control.get_status,
         lambda s: [s.get("websocketPort"), s.get("statusPort")]),
        ("worldBook", "World Book", world_book_control.get_status,
         lambda s: [s.get("port")]),
    ):
        try:
            status = status_fn() or {}
        except Exception as exc:  # noqa: BLE001
            status = {"running": False, "message": f"status unavailable: {exc}"}
        services.append({
            "key": key,
            "label": label,
            "running": status.get("running") is True,
            "ports": [p for p in ports(status) if p],
            "message": status.get("message") or "",
            "headless": eveos_console_prefs.headless_for(key),
            "overridden": key in prefs["services"],
        })
    return {
        "ok": True,
        "default": prefs["default"],
        "envForced": bool(str(os.environ.get("EVEOS_HEADLESS", "")).strip()),
        "controlPlanePort": _SERVER.server_port if _SERVER else None,
        "services": services,
    }


def _stop_everything() -> dict:
    """Stop every EveOS surface, not just the web server.

    "Stop" in the UI means "shut EveOS down", but it only ever stopped the localhost server. World
    Book and the Gemini backend kept running with their terminal windows open, and once the page was
    gone there was no longer anything on screen offering to stop them -- so each session left more
    orphaned services behind. Stopped dependents-first, then the surface that hosts them.

    A failure to stop one surface must not prevent the others from stopping, so each is isolated;
    what happened to each is reported back rather than swallowed.
    """
    also = {}
    for name, stop in (("worldBook", world_book_control.stop_server),
                       ("gemini", gemini_control.stop_server)):
        try:
            also[name] = "stopped" if (stop() or {}).get("ok", True) else "reported not-ok"
        except Exception as exc:  # noqa: BLE001
            also[name] = f"error: {exc}"

    payload = eveos_web_control.stop_server()
    payload["stoppedAlso"] = also
    # ...and the plane last, so "Stop" really does leave nothing running. Its console closing is
    # the visible confirmation; leaving it up made a completed stop look like a failed one.
    payload["controlPlaneStopping"] = _shutdown_plane_after_response()
    return payload


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
        if path == "/api/control-plane/consoles":
            self._send(_console_overview())
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
            "/api/control-plane/consoles",
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
            action = _stop_everything
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
        if path == "/api/control-plane/consoles":
            body = gemini_credentials.read_json_body(self) or {}
            try:
                # A console preference only takes effect the next time that service starts; the
                # already-running process keeps whatever window it was born with.
                eveos_console_prefs.set_console(body.get("service"), bool(body.get("headless")))
                payload = _console_preferences()
                payload["message"] = "Applies the next time that service starts."
            except ValueError as exc:
                payload = {"ok": False, "message": str(exc)}
            self._send(payload, HTTPStatus.OK if payload.get("ok") else HTTPStatus.BAD_REQUEST)
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
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionError, OSError):
            # The caller went away mid-request. Most visible on Stop, where the page tears its
            # polling down the moment it fires: the work already happened and only the reply was
            # lost, so a WinError 10053 traceback in a console the user is watching is pure noise
            # that reads like the stop itself failed.
            pass


def main() -> int:
    parser = argparse.ArgumentParser(description="EveOS file-mode local control plane")
    parser.add_argument("port", nargs="?", type=int, default=DEFAULT_PORT)
    parser.add_argument("--probe", action="store_true", help="Wait for a verified control plane and exit")
    parser.add_argument("--timeout", type=float, default=30.0, help="Probe timeout in seconds")
    args = parser.parse_args()
    if args.probe:
        return wait_for_control(args.port, args.timeout)
    global _SERVER
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), EveOSControlHandler)
    _SERVER = server
    print("[OK] EveOS local control plane")
    print(f"  Consoles: {'headless' if eveos_web_control.headless_mode() else 'visible'}"
          " (set EVEOS_HEADLESS=1 to hide spawned servers)")
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
