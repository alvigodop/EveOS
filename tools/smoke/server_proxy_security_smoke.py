"""Security contract for EveOS's local outbound proxy paths."""

from __future__ import annotations

import io
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules import proxy
from server_modules import outbound_http


class _Handler:
    def __init__(self):
        self.headers = {}
        self.wfile = io.BytesIO()
        self.status = None
        self.response_headers = {}

    def send_response(self, status):
        self.status = int(status)

    def send_header(self, key, value):
        self.response_headers[key] = value

    def end_headers(self):
        return None


def assert_target(url, expected):
    allowed, _reason = proxy.validate_proxy_target(url, resolve_dns=False)
    assert allowed is expected, f"unexpected proxy policy for {url}: {allowed}"


if __name__ == "__main__":
    assert_target("https://example.com/media.mp3", True)
    assert_target("http://example.com/data.json", True)
    assert_target("file:///C:/Users/example/private.txt", False)
    assert_target("http://localhost:9084/status", False)
    assert_target("http://localhost.:9084/status", False)
    assert_target("http://127.0.0.1:3000/api/status", False)
    assert_target("http://192.168.1.10/private", False)
    assert_target("https://user:password@example.com/private", False)
    assert_target("https://example.com:invalid/path", False)
    assert_target("ftp://example.com/file", False)

    with patch(
        "server_modules.outbound_http.socket.getaddrinfo",
        return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))],
    ):
        allowed, _reason = outbound_http.validate_public_http_target("http://public-name.test")
    assert not allowed, "DNS-resolved loopback target was accepted"

    redirect_handler = outbound_http.PublicOnlyRedirectHandler()
    try:
        redirect_handler.redirect_request(
            urllib.request.Request("https://example.com"),
            io.BytesIO(),
            302,
            "Found",
            {},
            "http://127.0.0.1/private",
        )
    except urllib.error.HTTPError as error:
        assert error.code == 403
    else:
        raise AssertionError("Redirect into a loopback target was accepted")

    handler = _Handler()
    with patch("urllib.request.urlopen") as urlopen:
        proxy.handle_proxy_request(handler, {"url": ["file:///C:/private.txt"]})
    assert handler.status == 400
    assert not urlopen.called

    proxy_source = (ROOT / "server_modules" / "proxy.py").read_text(encoding="utf-8")
    popup_source = (ROOT / "server_modules" / "popup_viewer_http.py").read_text(encoding="utf-8")
    wikipedia_source = (ROOT / "server_modules" / "wikipedia.py").read_text(encoding="utf-8")
    for source in (proxy_source, popup_source, wikipedia_source):
        assert "ssl.CERT_NONE" not in source
        assert "check_hostname = False" not in source
        assert "build_public_opener" in source
    assert "Access-Control-Allow-Origin', '*'" not in proxy_source
    assert 'Access-Control-Allow-Origin", "*"' not in proxy_source

    print("SERVER_PROXY_SECURITY_SMOKE_OK")
