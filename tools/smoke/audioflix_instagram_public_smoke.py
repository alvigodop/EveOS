"""Contract smoke tests for the no-login Instagram public resolver."""

from __future__ import annotations

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


def fake_request(url: str, *, method="GET", body=None, headers=None, timeout=12):
    del method, headers, timeout
    if "get_ruling_for_content" in url:
        return b'{"csrf_token":"fake-csrf"}'
    parsed = urlparse(url)
    if parsed.path == "/graphql/query/":
        values = parse_qs((body or b"").decode("utf-8"))
        variables = json.loads(values["variables"][0])
        check(variables["shortcode"] == "DS2r6KBDNCS", "GraphQL request preserves shortcode")
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
    raise AssertionError(f"Unexpected public resolver request: {url}")


original_request = public._request
try:
    public._request = fake_request
    result = public.resolve_public("DS2r6KBDNCS")
    check(result.get("ok") is True, "public resolver returns success for current GraphQL video shape")
    check(result.get("source") == "instagram-graphql", "GraphQL is identified as the resolver source")
    check(result.get("videoUrl", "").endswith("DS2r6KBDNCS.mp4?x=1"), "direct video URL is normalized")
    check(result.get("title") == "test post", "caption is normalized to title")
finally:
    public._request = original_request


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
    check(proxy_result.get("ok") is True, "public resolver uses proxy as final fallback")
    check(proxy_result.get("source") == "instagram-public-proxy", "proxy source is preserved")
    check(proxy_result.get("videoUrl", "").endswith("DS2r6KBDNCS-proxy.mp4"), "proxy direct video URL is returned")
finally:
    public._graphql = original_graphql
    public._embed = original_embed
    proxy.resolve_public = original_proxy

print("AUDIOFLIX_INSTAGRAM_PUBLIC_SMOKE_OK")
