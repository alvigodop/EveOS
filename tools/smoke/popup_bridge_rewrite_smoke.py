import pathlib
import re
import sys
import urllib.parse

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from server_modules import popup_viewer


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


sample_html = """
<!doctype html>
<html>
<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'">
    <meta http-equiv="refresh" content="0; url=https://example.com/redirect">
    <link rel="modulepreload" crossorigin href="/_nuxt/entry.js">
    <link rel="stylesheet" crossorigin href="/_nuxt/app.css">
    <style>body { background-image: url('/images/bg.png'); }</style>
    <title>Sample</title>
</head>
<body>
    <a href="/title/123">Open Title</a>
    <script type="module" crossorigin src="/_nuxt/main.js"></script>
    <img src="/covers/test.png" srcset="/covers/test-2x.png 2x">
</body>
</html>
"""

allowed, reason = popup_viewer.is_popup_target_allowed("https://mangadex.org/title/123")
assert_true(allowed, f"Expected public site to be allowed, got: {reason}")

blocked, _reason = popup_viewer.is_popup_target_allowed("http://127.0.0.1:3000/private")
assert_true(not blocked, "Expected loopback targets to be blocked")

document = popup_viewer.build_popup_document("https://mangadex.org/title/123", sample_html)

assert_true('<base href="https://mangadex.org/title/123">' in document, "Popup rewrite should inject a base tag")
assert_true("/api/popup-resource/" in document, "Popup rewrite should inject the popup resource bridge")
assert_true("Service workers are disabled inside the EveOS popup bridge." in document, "Popup rewrite should inject the service worker guard")
assert_true("Content-Security-Policy" not in document, "Popup rewrite should strip meta CSP from upstream HTML")
assert_true('http-equiv="refresh"' not in document.lower(), "Popup rewrite should strip meta refresh redirects")
assert_true('/api/popup-resource/https/mangadex.org/_nuxt/entry.js' in document, "Popup rewrite should localize modulepreload assets")
assert_true('/api/popup-resource/https/mangadex.org/_nuxt/app.css' in document, "Popup rewrite should localize stylesheet assets")
assert_true('/api/popup-resource/https/mangadex.org/_nuxt/main.js' in document, "Popup rewrite should localize script assets")
assert_true('/api/popup-resource/https/mangadex.org/covers/test.png' in document, "Popup rewrite should localize img src assets")
assert_true('/api/popup-resource/https/mangadex.org/covers/test-2x.png 2x' in document, "Popup rewrite should localize img srcset assets")
assert_true('/api/popup-resource/https/mangadex.org/images/bg.png' in document, "Popup rewrite should localize inline style assets")
assert_true(
    re.search(r'<link[^>]+href="/api/popup-resource/https/mangadex.org/_nuxt/entry.js"[^>]*>', document, re.I)
    and 'crossorigin' not in re.search(r'<link[^>]+href="/api/popup-resource/https/mangadex.org/_nuxt/entry.js"[^>]*>', document, re.I).group(0).lower(),
    "Popup rewrite should strip crossorigin from proxied link tags",
)
assert_true(
    re.search(r'<script[^>]+src="/api/popup-resource/https/mangadex.org/_nuxt/main.js"[^>]*>', document, re.I)
    and 'crossorigin' not in re.search(r'<script[^>]+src="/api/popup-resource/https/mangadex.org/_nuxt/main.js"[^>]*>', document, re.I).group(0).lower(),
    "Popup rewrite should strip crossorigin from proxied script tags",
)

existing_bridge_url = "http://127.0.0.1:3040/api/popup-resource/https/mangadex.org/_nuxt/app.css"
assert_true(
    popup_viewer._resolve_popup_asset_url(
        "https://mangadex.org/title/123",
        existing_bridge_url,
        bridge_base="http://127.0.0.1:3040",
    ) == existing_bridge_url,
    "Popup rewrite should not re-proxy absolute bridge URLs",
)
assert_true(
    popup_viewer._resolve_popup_asset_url(
        "https://mangadex.org/title/123",
        "/api/popup-resource/https/mangadex.org/_nuxt/app.css",
        bridge_base="http://127.0.0.1:3040",
    ) == existing_bridge_url,
    "Popup rewrite should normalize relative bridge URLs without re-proxying them",
)

rebridged_document = popup_viewer.build_popup_document(
    "https://mangadex.org/title/123",
    f'<html><head><link rel="stylesheet" href="{existing_bridge_url}"></head><body></body></html>',
    bridge_base="http://127.0.0.1:3040",
)
assert_true(
    "/api/popup-resource/http/127.0.0.1:3040/api/popup-resource/" not in rebridged_document,
    "Popup rewrite should not generate recursive popup-resource URLs",
)


class HandlerStub:
    def __init__(self, path):
        self.path = path


request_path = "/api/popup-resource/https/example.com/assets/app.js?url=keep-me&v=2"
handler = HandlerStub(request_path)
query = urllib.parse.parse_qs(urllib.parse.urlparse(request_path).query, keep_blank_values=True)
assert_true(
    popup_viewer._extract_target_url(handler, query, "resource") == "https://example.com/assets/app.js?url=keep-me&v=2",
    "Popup resource extraction should preserve upstream query strings in path-style bridge URLs",
)

print("POPUP_BRIDGE_REWRITE_SMOKE_OK")
