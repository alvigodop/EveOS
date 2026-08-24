"""Launch the EveOS Python server and verify its core HTTP surface is alive."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "server" / "python-server.py"


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def fetch(url: str) -> tuple[int, bytes]:
    with urlopen(url, timeout=2) as response:
        return int(response.status), response.read()


def main() -> int:
    if not SERVER.is_file():
        raise SystemExit(f"ASSERT FAILED: missing server entrypoint: {SERVER}")

    port = free_port()
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    process = subprocess.Popen(
        [sys.executable, str(SERVER), str(port), "--no-browser"],
        cwd=ROOT,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    deadline = time.monotonic() + 12
    captured: list[str] = []
    try:
        while time.monotonic() < deadline:
            if process.poll() is not None:
                output = process.stdout.read() if process.stdout else ""
                captured.append(output)
                raise SystemExit(
                    "ASSERT FAILED: EveOS server exited before becoming ready.\n"
                    + "".join(captured)
                )
            try:
                status, body = fetch(f"http://127.0.0.1:{port}/api/status")
                if status != 200:
                    raise SystemExit(f"ASSERT FAILED: /api/status returned HTTP {status}")
                payload = json.loads(body.decode("utf-8"))
                if not isinstance(payload, dict):
                    raise SystemExit("ASSERT FAILED: /api/status did not return a JSON object")

                page_status, page = fetch(f"http://127.0.0.1:{port}/EveOS.html")
                if page_status != 200:
                    raise SystemExit(f"ASSERT FAILED: /EveOS.html returned HTTP {page_status}")
                if b"EveOS" not in page[:20000]:
                    raise SystemExit("ASSERT FAILED: /EveOS.html did not return EveOS content")

                print("EVEOS_SERVER_STARTUP_SMOKE_OK")
                return 0
            except (URLError, TimeoutError, ConnectionError, OSError):
                time.sleep(0.2)

        output = process.stdout.read() if process.stdout else ""
        raise SystemExit(
            "ASSERT FAILED: EveOS server did not become ready within 12 seconds.\n" + output
        )
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)


if __name__ == "__main__":
    raise SystemExit(main())
