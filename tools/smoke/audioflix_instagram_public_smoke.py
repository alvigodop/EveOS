"""Contract smoke tests for the no-login Instagram public resolver."""

from __future__ import annotations

import http.cookiejar
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = str(Path(__file__).resolve().parents[2])
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from server_modules import audioflix_instagram_public as public


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def fake_request(url: str, *, method="GET", body=None, headers=None, timeout=12, opener=None):
    del method, headers, timeout, opener
    if url == "https://www.instagram.com/":
        return b'<script>window.__BOOT=["LSD",[],{"token":"fake-lsd"}]</script>'
    if "get_ruling_for_content" in url:
        return b'{"status":"ok"}'
    parsed = urlparse(url)
    if parsed.path == "/api/graphql":
        values = parse_qs((body or b"").decode("utf-8"))
        check(values["doc_id"][0] == "27130156389949648", "logged-out Polaris doc_id is current")
        variables = json.loads(values["variables"][0])
        check(variables["media_id"] == str(public.shortcode_to_pk("DS2r6KBDNCS")), "Polaris request uses numeric media id")
        return json.dumps({
            "data": {
                "xig_polaris_media": {
                    "if_not_gated_logged_out": {
                        "media_type": 2,
                        "code": "DS2r6KBDNCS",
                        "video_versions": [{
                            "url": "https://cdn.example.test/video/DS2r6KBDNCS.mp4?x=loggedout",
                            "width": 1080,
                            "height": 1920,
                        }],
                        "video_duration": 9.5,
                        "image_versions2": {"candidates": [{"url": "https://cdn.example.test/image.jpg", "width": 1080, "height": 1920}]},
                        "caption": {"text": "logged-out Polaris post"},
                    }
                }
            }
        }).encode("utf-8")
    if parsed.path == "/graphql/query/":
        return json.dumps({"data": {}}).encode("utf-8")
    raise AssertionError(f"Unexpected public resolver request: {url}")


class FakeOpener:
    def __init__(self):
        self.cookie_jar = http.cookiejar.CookieJar()


def fake_new_session():
    opener = FakeOpener()
    cookie = http.cookiejar.Cookie(
        version=0, name="csrftoken", value="fake-csrf", port=None, port_specified=False,
        domain=".instagram.com", domain_specified=True, domain_initial_dot=True,
        path="/", path_specified=True, secure=True, expires=None, discard=True,
        comment=None, comment_url=None, rest={}, rfc2109=False,
    )
    opener.cookie_jar.set_cookie(cookie)
    return opener, opener.cookie_jar


original_request = public._request
original_new_session = public._new_session
try:
    public._request = fake_request
    public._new_session = fake_new_session
    result = public.resolve_public("DS2r6KBDNCS")
    check(result.get("ok") is True, "logged-out Polaris resolver returns success")
    check(result.get("source") == "instagram-polaris-logged-out", "Polaris source is identified")
    check(result.get("videoUrl", "").endswith("DS2r6KBDNCS.mp4?x=loggedout"), "direct video URL is normalized")
    check(result.get("title") == "logged-out Polaris post", "caption is normalized to title")
finally:
    public._request = original_request
    public._new_session = original_new_session


# Preserve a contract check for the older public GraphQL response shape.
def legacy_fake_request(url: str, *, method="GET", body=None, headers=None, timeout=12, opener=None):
    del method, headers, timeout, opener
    if "get_ruling_for_content" in url:
        return b'{"csrf_token":"fake-csrf"}'
    parsed = urlparse(url)
    if parsed.path == "/graphql/query/":
        values = parse_qs((body or b"").decode("utf-8"))
        variables = json.loads(values["variables"][0])
        check(variables["shortcode"] == "DS2r6KBDNCS", "legacy GraphQL request preserves shortcode")
        return json.dumps({
            "data": {
                "xdt_api__v1__media__shortcode__web_info": {
                    "items": [{
                        "media_type": 2,
                        "code": "DS2r6KBDNCS",
                        "video_versions": [{"url": "https://cdn.example.test/video/DS2r6KBDNCS.mp4?x=1", "width": 1080, "height": 1920}],
                        "video_duration": 9.5,
                        "image_versions2": {"candidates": [{"url": "https://cdn.example.test/image.jpg", "width": 1080, "height": 1920}]},
                        "caption": {"text": "test post"},
                    }]
                }
            }
        }).encode("utf-8")
    raise AssertionError(f"Unexpected legacy resolver request: {url}")

original_request = public._request
original_new_session = public._new_session
try:
    public._request = legacy_fake_request
    public._new_session = lambda: (FakeOpener(), http.cookiejar.CookieJar())
    result = public._graphql("DS2r6KBDNCS", "")
    check(result is not None, "legacy public GraphQL parser remains available")
    legacy_result = public._video_payload(result, source="instagram-graphql")
    check(legacy_result.get("ok") is True, "legacy response normalizes")
finally:
    public._request = original_request
    public._new_session = original_new_session


# Verify the public proxy becomes the last resort when Instagram's direct
# anonymous endpoints and embed representation are unavailable.
import server_modules.audioflix_instagram_public_proxy as proxy

original_graphql = public._graphql
original_embed = public._embed
original_proxy = proxy.resolve_public
try:
    public._graphql = lambda *_args, **_kwargs: None
    public._embed = lambda *_args, **_kwargs: None
    proxy.resolve_public = lambda url: {
        "ok": True,
        "videoUrl": "https://cdn.example.test/video/DS2r6KBDNCS-proxy.mp4",
        "title": "Proxy test post",
        "thumbnail": "",
        "duration": 9,
        "source": "instagram-public-proxy",
    }
    proxy_result = public.resolve_public("DS2r6KBDNCS")
    check(proxy_result.get("ok") is True, "public resolver uses proxy as fallback")
    check(proxy_result.get("source") == "instagram-public-proxy", "proxy source is preserved")
finally:
    public._graphql = original_graphql
    public._embed = original_embed
    proxy.resolve_public = original_proxy

print("AUDIOFLIX_INSTAGRAM_PUBLIC_SMOKE_OK")
