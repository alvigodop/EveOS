"""Regression guard for progressive Audioflix media proxy responses."""

from __future__ import annotations

import io
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules import proxy


class _Writer(io.BytesIO):
    def __init__(self):
        super().__init__()
        self.flushes = 0

    def flush(self):
        self.flushes += 1


class _Handler:
    def __init__(self, range_header=None):
        self.headers = {}
        if range_header:
            self.headers["Range"] = range_header
        self.wfile = _Writer()
        self.status = None
        self.response_headers = {}

    def send_response(self, status):
        self.status = int(status)

    def send_header(self, key, value):
        self.response_headers[key] = value

    def end_headers(self):
        return None


class _Response:
    def __init__(self, status=200):
        self.status = status
        self._chunks = [b"a" * (64 * 1024), b"tail"]
        self.read_sizes = []
        self._headers = {
            "Content-Type": "application/octet-stream",
            "Content-Length": str((64 * 1024) + 4),
            "Accept-Ranges": "bytes",
        }

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def getcode(self):
        return self.status

    def getheader(self, name, default=None):
        return self._headers.get(name, default)

    def read(self, size=-1):
        self.read_sizes.append(size)
        return self._chunks.pop(0) if self._chunks else b""


class _Opener:
    def __init__(self, response):
        self.response = response

    def open(self, *_args, **_kwargs):
        return self.response


def run_case(*, media_hint=False, range_header=None, status=200):
    response = _Response(status=status)
    handler = _Handler(range_header=range_header)
    query = {"url": ["https://media.example/audio-stream"]}
    if media_hint:
        query["media"] = ["1"]
    with (
        patch.object(proxy, "validate_proxy_target", return_value=(True, "")),
        patch.object(proxy, "build_public_opener", return_value=_Opener(response)),
    ):
        proxy.handle_proxy_request(handler, query)
    assert handler.status == status
    assert handler.wfile.getvalue() == (b"a" * (64 * 1024)) + b"tail"
    assert response.read_sizes == [64 * 1024, 64 * 1024, 64 * 1024]
    assert handler.wfile.flushes == 2
    assert handler.response_headers.get("Accept-Ranges") == "bytes"


if __name__ == "__main__":
    run_case(media_hint=True)
    run_case(range_header="bytes=0-65535", status=206)
    print("AUDIOFLIX_PROXY_STREAMING_SMOKE_OK")
