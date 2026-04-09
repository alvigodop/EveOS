import pathlib
import sys

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
    <title>Sample</title>
</head>
<body>
    <a href="/title/123">Open Title</a>
</body>
</html>
"""

allowed, reason = popup_viewer.is_popup_target_allowed("https://mangadex.org/title/123")
assert_true(allowed, f"Expected public site to be allowed, got: {reason}")

blocked, _reason = popup_viewer.is_popup_target_allowed("http://127.0.0.1:3000/private")
assert_true(not blocked, "Expected loopback targets to be blocked")

document = popup_viewer.build_popup_document("https://mangadex.org/title/123", sample_html)

assert_true('<base href="https://mangadex.org/title/123">' in document, "Popup rewrite should inject a base tag")
assert_true("/api/popup-resource?url=" in document, "Popup rewrite should inject the popup resource bridge")
assert_true("Service workers are disabled inside the EveOS popup bridge." in document, "Popup rewrite should inject the service worker guard")
assert_true("Content-Security-Policy" not in document, "Popup rewrite should strip meta CSP from upstream HTML")
assert_true('http-equiv="refresh"' not in document.lower(), "Popup rewrite should strip meta refresh redirects")

print("POPUP_BRIDGE_REWRITE_SMOKE_OK")
