"""Public, no-login Instagram media extraction for Audioflix.

Uses Instagram's public web GraphQL/media endpoint first, then its embed/direct
page representations. This intentionally does not require an Instagram
account, cookie file, browser profile, API key, or third-party downloader site.
"""

from __future__ import annotations

import html
import json
import os
import re
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

_APP_ID = "936619743392459"
_DEFAULT_DOC_ID = "8845758582119845"
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
)
_SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


def _doc_id() -> str:
    return os.environ.get("EVEOS_INSTAGRAM_GRAPHQL_DOC_ID", "").strip() or _DEFAULT_DOC_ID


def shortcode_to_pk(shortcode: str) -> int:
    value = 0
    for char in str(shortcode or "").strip():
        value = (value * 64) + _SHORTCODE_ALPHABET.index(char)
    return value


def _headers(csrf: str = "") -> dict[str, str]:
    headers = {
        "User-Agent": _USER_AGENT,
        "X-IG-App-ID": _APP_ID,
        "X-ASBD-ID": "198387",
        "X-IG-WWW-Claim": "0",
        "Origin": "https://www.instagram.com",
        "Referer": "https://www.instagram.com/",
        "Accept": "*/*",
    }
    if csrf:
        headers["X-CSRFToken"] = csrf
    return headers


def _request(url: str, *, method: str = "GET", body: bytes | None = None, headers: dict[str, str] | None = None, timeout: int = 12) -> bytes:
    request = Request(url, data=body, headers=headers or _headers(), method=method)
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def _session_csrf(shortcode: str) -> str:
    target_id = shortcode_to_pk(shortcode)
    url = "https://i.instagram.com/api/v1/web/get_ruling_for_content/?" + urlencode({
        "content_type": "MEDIA",
        "target_id": str(target_id),
    })
    try:
        raw = _request(url, headers=_headers(), timeout=10)
    except Exception:
        return ""
    text = raw.decode("utf-8", errors="replace")
    match = re.search(r"(?:^|;\s*)csrftoken=([^;\s]+)", text, re.IGNORECASE)
    return match.group(1) if match else ""


def _graphql(shortcode: str, csrf: str) -> dict[str, Any] | None:
    variables = {
        "shortcode": shortcode,
        "child_comment_count": 3,
        "fetch_comment_count": 40,
        "parent_comment_count": 24,
        "has_threaded_comments": True,
    }
    form = urlencode({
        "variables": json.dumps(variables, separators=(",", ":")),
        "doc_id": _doc_id(),
    }).encode("utf-8")
    headers = _headers(csrf)
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    headers["X-Requested-With"] = "XMLHttpRequest"
    try:
        raw = _request("https://www.instagram.com/graphql/query/", method="POST", body=form, headers=headers, timeout=12)
        payload = json.loads(raw.decode("utf-8", errors="replace"))
    except Exception:
        return None
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return None
    media = data.get("xdt_shortcode_media") or data.get("shortcode_media")
    return media if isinstance(media, dict) else None


def _walk_video_urls(value: Any, found: list[str]) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            key_lower = str(key).lower()
            if key_lower in {"video_url", "url"} and isinstance(item, str):
                if _looks_like_video(item):
                    found.append(item)
            elif key_lower in {"video_versions", "video_info", "video_resources", "variants"}:
                _walk_video_urls(item, found)
            elif isinstance(item, (dict, list)):
                _walk_video_urls(item, found)
    elif isinstance(value, list):
        for item in value:
            _walk_video_urls(item, found)


def _looks_like_video(url: str) -> bool:
    lower = str(url or "").lower()
    return lower.startswith(("http://", "https://")) and (
        ".mp4" in lower or "/video/" in lower or "video_url" in lower or "playable_url" in lower
    )


def _clean(value: str) -> str:
    return html.unescape(str(value or "")).replace("\\u0026", "&").replace("\\/", "/").strip().strip('"').strip("'")


def _video_payload(media: dict[str, Any], *, source: str) -> dict[str, Any] | None:
    found: list[str] = []
    _walk_video_urls(media, found)
    cleaned = []
    for url in found:
        url = _clean(url)
        if url and url not in cleaned:
            cleaned.append(url)
    if not cleaned:
        return None

    dimensions = media.get("dimensions") if isinstance(media.get("dimensions"), dict) else {}
    title = ""
    caption = media.get("caption")
    if isinstance(caption, str):
        title = caption.strip()
    if not title and isinstance(media.get("edge_media_to_caption"), dict):
        edges = media["edge_media_to_caption"].get("edges")
        if isinstance(edges, list) and edges:
            node = edges[0].get("node") if isinstance(edges[0], dict) else None
            if isinstance(node, dict):
                title = str(node.get("text") or "").strip()

    return {
        "ok": True,
        "videoUrl": cleaned[0],
        "videoUrls": cleaned,
        "title": title[:180] or "Instagram Video",
        "thumbnail": media.get("display_url") or media.get("thumbnail_src") or "",
        "duration": media.get("video_duration") or 0,
        "width": dimensions.get("width") or 0,
        "height": dimensions.get("height") or 0,
        "source": source,
    }


def _embed(shortcode: str) -> dict[str, Any] | None:
    for prefix in ("p", "reel"):
        url = f"https://www.instagram.com/{prefix}/{shortcode}/embed/"
        try:
            page = _request(url, headers=_headers(), timeout=10).decode("utf-8", errors="replace")
        except Exception:
            continue
        candidates = re.findall(r'"(?:video_url|contentUrl)"\s*[:=]\s*"([^"]+)"', page, re.IGNORECASE)
        candidates += re.findall(r'<meta[^>]+(?:property|name)=["\'](?:og:video(?::secure_url)?|twitter:player:stream)["\'][^>]+content=["\']([^"\']+)', page, re.IGNORECASE)
        for candidate in candidates:
            candidate = _clean(candidate)
            if _looks_like_video(candidate):
                return {"ok": True, "videoUrl": candidate, "title": "Instagram Video", "thumbnail": "", "duration": 0, "width": 0, "height": 0, "source": "instagram-embed"}
    return None


def resolve_public(shortcode: str) -> dict[str, Any]:
    shortcode = str(shortcode or "").strip()
    if not shortcode:
        return {"ok": False, "reason": "Missing Instagram shortcode."}

    csrf = _session_csrf(shortcode)
    media = _graphql(shortcode, csrf)
    if media:
        result = _video_payload(media, source="instagram-graphql")
        if result:
            return result

        children = ((media.get("edge_sidecar_to_children") or {}).get("edges") or []) if isinstance(media, dict) else []
        if isinstance(children, list):
            for edge in children:
                node = edge.get("node") if isinstance(edge, dict) else None
                if isinstance(node, dict):
                    result = _video_payload(node, source="instagram-graphql-carousel")
                    if result:
                        return result

    result = _embed(shortcode)
    if result:
        return result
    return {"ok": False, "reason": "Instagram public media endpoints did not expose a playable video."}
