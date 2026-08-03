"""World Book relocation, UI contract, and persisted lifecycle smoke."""

from __future__ import annotations

import json
import socket
import subprocess
import sys
import tempfile
import textwrap
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules import world_book_control


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def wait_until(predicate, timeout: float = 4.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


def assert_static_contract() -> None:
    tool = ROOT / "tools" / "World-Book"
    assert (tool / "server.py").is_file()
    assert (tool / "launch.ps1").is_file()
    assert (tool / "app" / "index.html").is_file()
    assert (tool / "worldbook_runtime" / "bootstrap.py").is_file()

    html = (ROOT / "EveOS.html").read_text(encoding="utf-8")
    assert "Notes &amp; World Books" in html
    assert "world-book.client.js" in html
    assert "world-book.overlay.js" in html
    client = (ROOT / "js" / "modules" / "features" / "world-book" / "world-book.client.js").read_text(encoding="utf-8")
    assert "api/health" in client
    assert "standalone launcher" in client
    overlay = (ROOT / "js" / "modules" / "features" / "world-book" / "world-book.overlay.js").read_text(encoding="utf-8")
    detached = (ROOT / "js" / "modules" / "features" / "world-book" / "world-book.detach.js").read_text(encoding="utf-8")
    assert "world-book.detach.js" in html
    assert 'data-world-book-detach' in overlay
    assert "ns.detach" in overlay
    assert "eveWorldBookWindow" in detached
    assert "window.open" in detached

    server = (ROOT / "server" / "python-server.py").read_text(encoding="utf-8")
    assert "world_book_control.handle_get_request" in server
    assert "world_book_control.handle_post_request" in server
    assert "world_book_control.restore_desired_state_async" in server
    control = (ROOT / "server_modules" / "world_book_control.py").read_text(encoding="utf-8")
    assert "launch.ps1" in control

    handler = (tool / "worldbook_runtime" / "layers" / "80_http_handler.py").read_text(encoding="utf-8")
    assert 'parsed.path == "/api/health"' in handler
    assert "Access-Control-Allow-Origin" in handler

    launch_batch = (tool / "launch.bat").read_text(encoding="utf-8")
    assert 'launch.ps1" %*' in launch_batch

    ports = (ROOT / "tools" / "batch" / "eveos-ports.bat").read_text(encoding="utf-8")
    assert 'set "WORLD_BOOK_PORT=8766"' in ports


def assert_private_data_contract() -> None:
    ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "tools/World-Book/data/**" in ignore
    assert "!tools/World-Book/data/README.txt" in ignore

    if not (ROOT / ".git").exists():
        return
    result = subprocess.run(
        ["git", "ls-files", "--", "tools/World-Book/data/**"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    tracked = {line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()}
    assert tracked <= {"tools/World-Book/data/README.txt"}, (
        "World Book private runtime data is tracked: " + ", ".join(sorted(tracked))
    )


def assert_lifecycle_contract() -> None:
    with tempfile.TemporaryDirectory(prefix="eveos-world-book-smoke-") as temporary:
        root = Path(temporary)
        fake_server = root / "server.py"
        preference = root / "world-book-service.json"
        port = free_port()
        fake_server.write_text(
            textwrap.dedent(
                """
                import argparse
                import json
                from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

                parser = argparse.ArgumentParser()
                parser.add_argument("--port", type=int, required=True)
                parser.add_argument("--no-browser", action="store_true")
                args = parser.parse_args()

                class Handler(BaseHTTPRequestHandler):
                    def do_GET(self):
                        payload = {"ok": True, "appVersion": "smoke", "config": {}}
                        body = json.dumps(payload).encode("utf-8")
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Content-Length", str(len(body)))
                        self.end_headers()
                        self.wfile.write(body)

                    def log_message(self, *_args):
                        return

                ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
                """
            ).strip()
            + "\n",
            encoding="utf-8",
        )

        original_port = world_book_control.WORLD_BOOK_PORT
        original_entry = world_book_control._entry_point
        original_preference = world_book_control._preference_path
        try:
            world_book_control.WORLD_BOOK_PORT = port
            world_book_control._entry_point = lambda: fake_server
            world_book_control._preference_path = lambda: preference

            started = world_book_control.start_server()
            assert started["ok"] and wait_until(lambda: world_book_control.get_status()["running"])
            assert json.loads(preference.read_text(encoding="utf-8"))["desiredRunning"] is True

            stopped = world_book_control.stop_server()
            assert stopped["ok"] and wait_until(lambda: not world_book_control.get_status()["running"])
            assert json.loads(preference.read_text(encoding="utf-8"))["desiredRunning"] is False

            world_book_control._write_desired_state(True)
            world_book_control.restore_desired_state()
            assert wait_until(lambda: world_book_control.get_status()["running"])
            world_book_control.stop_server(persist=False)
        finally:
            if world_book_control._PROCESS and world_book_control._PROCESS.poll() is None:
                world_book_control.stop_server(persist=False)
            world_book_control.WORLD_BOOK_PORT = original_port
            world_book_control._entry_point = original_entry
            world_book_control._preference_path = original_preference


if __name__ == "__main__":
    assert_static_contract()
    assert_private_data_contract()
    assert_lifecycle_contract()
    print("WORLD_BOOK_INTEGRATION_SMOKE_OK")
