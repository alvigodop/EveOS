"""Piano package, Audioflix host surface, privacy, HTTP, and lifecycle smoke."""

from __future__ import annotations

import http.client
import http.server
import json
import socket
import subprocess
import sys
import tempfile
import textwrap
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PIANO = ROOT / "tools" / "Piano-Auto-Player"
for candidate in (ROOT, PIANO):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from app import server as piano_server  # noqa: E402
from server_modules import piano_player_control  # noqa: E402


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def wait_until(predicate, timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


def request(port: int, method: str, path: str, origin: str = "null") -> tuple[int, bytes, str]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    try:
        connection.request(method, path, headers={"Origin": origin})
        response = connection.getresponse()
        return response.status, response.read(), response.getheader("Access-Control-Allow-Origin") or ""
    finally:
        connection.close()


def assert_static_contract() -> None:
    assert PIANO.is_dir() and not (PIANO / ".git").exists()
    html = (ROOT / "EveOS.html").read_text(encoding="utf-8")
    ui = (ROOT / "js" / "modules" / "features" / "audioflix" / "audioflix.ui.js").read_text(encoding="utf-8")
    actions = (ROOT / "js" / "modules" / "features" / "audioflix" / "audioflix.ui.actions.js").read_text(encoding="utf-8")
    piano_ui = (ROOT / "js" / "modules" / "features" / "audioflix" / "audioflix.piano.ui.js").read_text(encoding="utf-8")
    piano_client = (ROOT / "js" / "modules" / "features" / "audioflix" / "audioflix.piano.client.js").read_text(encoding="utf-8")
    bridge = (PIANO / "web" / "eveos-host-bridge.js").read_text(encoding="utf-8")
    state = (ROOT / "js" / "modules" / "core" / "state.js").read_text(encoding="utf-8")

    order = [ui.index(f"tabButton('{name}'") for name in ("soundboard", "music", "piano", "soundlab", "router")]
    assert all(index >= 0 for index in order) and order == sorted(order)
    for asset in ("audioflix.piano.css", "audioflix.piano.client.js", "audioflix.piano.ui.js"):
        assert asset in html
    assert "startsWith('piano-')" in actions and "EveAudioflixPianoUi?.handleAction" in actions
    assert "ensureController" in piano_client and "api/piano-player" in piano_client
    assert "Starting Piano-Auto-Player" in piano_ui and "location.replace" in piano_ui
    assert "sessionStorage" in bridge and "localStorage" not in bridge
    assert "pianoPlayerPort: 8771" in state

    helper = (ROOT / "server_modules" / "eveos_control_helper.py").read_text(encoding="utf-8")
    assert '"/api/piano-player/status"' in helper
    assert '"/api/piano-player/start"' in helper and '"/api/piano-player/stop"' in helper
    assert "piano_player_control.restore_desired_state_async()" in helper

    ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "tools/Piano-Auto-Player/data/**" in ignore
    assert "!tools/Piano-Auto-Player/data/README.txt" in ignore
    assert "tools/Piano-Auto-Player/youtube_session.txt" in ignore
    if (ROOT / ".git").exists():
        tracked = subprocess.run(
            ["git", "ls-files", "--", "tools/Piano-Auto-Player/data/**", "tools/Piano-Auto-Player/youtube_session.txt"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.splitlines()
        assert {value.replace("\\", "/") for value in tracked} <= {"tools/Piano-Auto-Player/data/README.txt"}


def assert_http_contract() -> None:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), piano_server.Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        status, body, cors = request(server.server_port, "GET", "/api/status")
        payload = json.loads(body.decode("utf-8"))
        assert status == 200 and payload["service"] == "piano-auto-player" and payload["appVersion"]
        assert cors == "null"
        status, body, _ = request(server.server_port, "GET", "/")
        assert status == 200 and b"eveos-host-bridge.js" in body
        status, _, cors = request(server.server_port, "OPTIONS", "/api/status", "https://example.com")
        assert status == 204 and not cors
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def assert_lifecycle_contract() -> None:
    with tempfile.TemporaryDirectory(prefix="eveos-piano-") as temporary:
        root = Path(temporary)
        fake = root / "piano.py"
        preference = root / "service.json"
        fake.write_text(textwrap.dedent("""
            import argparse, json
            from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
            parser = argparse.ArgumentParser()
            parser.add_argument('--host', default='127.0.0.1')
            parser.add_argument('--port', type=int, required=True)
            parser.add_argument('--no-browser', action='store_true')
            args = parser.parse_args()
            class Handler(BaseHTTPRequestHandler):
                def do_GET(self):
                    if self.path != '/api/status': return self.send_error(404)
                    body = json.dumps({'ok': True, 'service': 'piano-auto-player', 'appVersion': 'smoke'}).encode()
                    self.send_response(200); self.send_header('Content-Length', str(len(body)))
                    self.end_headers(); self.wfile.write(body)
                def log_message(self, *_args): pass
            ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
        """).strip() + "\n", encoding="utf-8")

        original = {
            "PIANO_PORT": piano_player_control.PIANO_PORT,
            "_entry": piano_player_control._entry,
            "_preference": piano_player_control._preference,
            "headless_for": piano_player_control.eveos_console_prefs.headless_for,
        }
        try:
            piano_player_control.PIANO_PORT = free_port()
            piano_player_control._entry = lambda: fake
            piano_player_control._preference = lambda: preference
            piano_player_control.eveos_console_prefs.headless_for = lambda _service: True
            started = piano_player_control.start_server()
            assert started["ok"] and wait_until(lambda: piano_player_control.get_status()["running"])
            assert json.loads(preference.read_text(encoding="utf-8"))["desiredRunning"] is True
            stopped = piano_player_control.stop_server()
            assert stopped["ok"] and not stopped["running"]
            assert json.loads(preference.read_text(encoding="utf-8"))["desiredRunning"] is False
        finally:
            if piano_player_control._PROCESS and piano_player_control._PROCESS.poll() is None:
                piano_player_control.stop_server(persist=False)
            piano_player_control.PIANO_PORT = original["PIANO_PORT"]
            piano_player_control._entry = original["_entry"]
            piano_player_control._preference = original["_preference"]
            piano_player_control.eveos_console_prefs.headless_for = original["headless_for"]


def assert_upstream_tests() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-t", ".", "-p", "test_*.py"],
        cwd=PIANO, capture_output=True, text=True, timeout=180, check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


if __name__ == "__main__":
    assert_static_contract()
    assert_http_contract()
    assert_lifecycle_contract()
    assert_upstream_tests()
    print("AUDIOFLIX_PIANO_INTEGRATION_SMOKE_OK")
