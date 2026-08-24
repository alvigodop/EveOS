"""Last-resort public Instagram media proxy adapter for Audioflix.

This adapter intentionally avoids Instagram account credentials. It uses a public
web downloader-style endpoint only after EveOS's first-party public extraction
strategies have failed. The endpoint is configurable so the dependency can be
replaced without touching the resolver contract.
"""

from __future__ import annotations

import http.cookiejar
import html
import json
import os
import re
from urllib.parse import quote, urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen

_DEFAULT_ENDPOINT = "https://indown.io/download"
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
)
_MAX_BODY = 2 * 1024 * 1024


def _clean(value: str) -> str:
    return (
        html.unescape(str(value or ""))
        .replace("\\u0026", "&")
        .replace("\\/", "/")
        .strip()
        .strip('"')
        .strip("'")
    )


def _looks_like_video(url: str) -> bool:
    lowered = _clean(url).lower()
    return lowered.startswith(("https://", "http://")) and (
        ".mp4" in lowered
        or ".m3u8" in lowered
        or "/video/" in lowered
        or "video_url" in lowered
        or "videourl" in lowered
        or "download_url" in lowered
    )


def _walk_json(value, found: list[str]) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            key_lower = str(key).lower()
            if isinstance(item, str) and key_lower in {
                "url", "video_url", "videourl", "download_url", "downloadurl", "contenturl",
            }:
                if _looks_like_video(item):
                    found.append(item)
            elif isinstance(item, (dict, list)):
                _walk_json(item, found)
    elif isinstance(value, list):
        for item in value:
            _walk_json(item, found)


def _extract_candidates(body: str) -> list[str]:
    candidates: list[str] = []
    try:
        payload = json.loads(body)
        _walk_json(payload, candidates)
    except (TypeError, ValueError):
        pass

    patterns = [
        r'href=[\"\'](https://[^\s\"\'<>]+\.mp4[^\s\"\'<>]*)[\"\']',
        r'src=[\"\'](https://[^\s\"\'<>]+\.mp4[^\s\"\'<>]*)[\"\']',
        r'(?i)(?:videoUrl|video_url|downloadUrl|download_url|contentUrl)\s*["\']?\s*[:=]\s*["\']([^"\']+)',
        r'https://[^\s"\']+\.(?:mp4|m3u8)(?:\?[^\s"\']*)?',
    ]
    for pattern in patterns:
        candidates.extend(re.findall(pattern, body))
    return candidates


def _indown_resolve(url: str) -> dict | None:
    try:
        jar = http.cookiejar.CookieJar()
        opener = build_opener(HTTPCookieProcessor(jar))
        headers = {
            "User-Agent": _USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        req1 = Request("https://indown.io/en2", headers=headers)
        with opener.open(req1, timeout=15) as res1:
            html1 = res1.read(_MAX_BODY).decode("utf-8", errors="replace")

        token_match = re.search(r'name=[\"\']_token[\"\']\s+value=[\"\']([^\"\']+)[\"\']', html1)
        if not token_match:
            token_match = re.search(r'value=[\"\']([^\"\']+)[\"\']\s+name=[\"\']_token[\"\']', html1)
        token = token_match.group(1) if token_match else ""

        post_data = urlencode({
            "referer": "https://indown.io/en2",
            "locale": "en",
            "_token": token,
            "link": url,
            "e": "e",
        }).encode("utf-8")

        post_headers = dict(headers)
        post_headers.update({
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": "https://indown.io",
            "Referer": "https://indown.io/en2",
        })
        req2 = Request("https://indown.io/download", data=post_data, headers=post_headers, method="POST")
        with opener.open(req2, timeout=15) as res2:
            html2 = res2.read(_MAX_BODY).decode("utf-8", errors="replace")

        candidates = _extract_candidates(html2)
        for candidate in candidates:
            candidate = _clean(candidate)
            if _looks_like_video(candidate):
                return {
                    "ok": True,
                    "videoUrl": candidate,
                    "title": "Instagram Video",
                    "thumbnail": "",
                    "duration": 0,
                    "width": 0,
                    "height": 0,
                    "source": "instagram-public-proxy",
                }
    except Exception:
        pass
    return None


def resolve_public(url: str) -> dict:
    custom_template = (os.environ.get("EVEOS_INSTAGRAM_PUBLIC_PROXY_URL") or "").strip()
    if custom_template:
        endpoint = custom_template.format(url=quote(url, safe=""))
        request = Request(
            endpoint,
            headers={
                "User-Agent": _USER_AGENT,
                "Accept": "application/json,text/html,*/*;q=0.8",
                "Referer": "https://www.instagram.com/",
            },
        )
        try:
            with urlopen(request, timeout=15) as response:
                final_url = response.geturl()
                content_type = str(response.headers.get("Content-Type") or "").lower()
                if _looks_like_video(final_url) or content_type.startswith("video/"):
                    return {
                        "ok": True,
                        "videoUrl": final_url,
                        "title": "Instagram Video",
                        "thumbnail": "",
                        "duration": 0,
                        "width": 0,
                        "height": 0,
                        "source": "instagram-public-proxy",
                    }
                body = response.read(_MAX_BODY).decode("utf-8", errors="replace")
                candidates = _extract_candidates(body)
                for candidate in candidates:
                    candidate = _clean(candidate)
                    if _looks_like_video(candidate):
                        return {
                            "ok": True,
                            "videoUrl": candidate,
                            "title": "Instagram Video",
                            "thumbnail": "",
                            "duration": 0,
                            "width": 0,
                            "height": 0,
                            "source": "instagram-public-proxy",
                        }
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "reason": f"Custom public Instagram proxy failed: {str(exc)[:220]}"}

    result = _indown_resolve(url)
    if result:
        return result

    return {"ok": False, "reason": "Public Instagram proxy did not expose a playable video URL."}

