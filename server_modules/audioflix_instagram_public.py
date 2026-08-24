"""Public, no-login Instagram media extraction for Audioflix.

Uses Instagram's current public web GraphQL/media representation first, then
Instagram embed/page representations, then a configurable public media proxy
fallback. No Instagram account, browser cookies, cookie export, or API key is
required for public media.
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
_CURRENT_DOC_ID = "27128499623469141"
_LEGACY_DOC_ID = "8845758582119845"
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
)
_SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


def _doc_ids() -> list[str]:
    configured = os.environ.get("EVEOS_INSTAGRAM_GRAPHQL_DOC_ID", "").strip()
    ids = [configured] if configured else [_CURRENT_DOC_ID, _LEGACY_DOC_ID]
    return list(dict.fromkeys(x for x in ids if x))


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
    url = "https://i.instagram.com/api/v1/web/get_ruling_for_content/?" + urlencode({"content_type": "MEDIA", "target_id": str(target_id)})
    try:
        raw = _request(url, headers=_headers(), timeout=10)
    except Exception:
        return ""
    text = raw.decode("utf-8", errors="replace")
    match = re.search(r'"csrf_token"\s*:\s*"([^"]+)"', text, re.IGNORECASE)
    return match.group(1) if match else ""


def _parse_graphql_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return None
    legacy = data.get("xdt_shortcode_media") or data.get("shortcode_media")
    if isinstance(legacy, dict):
        return legacy
    web_info = data.get("xdt_api__v1__media__shortcode__web_info")
    items = web_info.get("items") if isinstance(web_info, dict) else None
    if isinstance(items, list) and items and isinstance(items[0], dict):
        return items[0]
    return None


def _graphql(shortcode: str, csrf: str) -> dict[str, Any] | None:
    variables = {
        "shortcode": shortcode,
        "__relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider": False,
    }
    for doc_id in _doc_ids():
        form = urlencode({
            "variables": json.dumps(variables, separators=(",", ":")),
            "doc_id": doc_id,
            "server_timestamps": "true",
        }).encode("utf-8")
        headers = _headers(csrf)
        headers.update({
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            "X-FB-Friendly-Name": "PolarisPostActionLoadPostQueryQuery",
        })
        try:
            raw = _request(
                "https://www.instagram.com/graphql/query/",
                method="POST",
                body=form,
                headers=headers,
                timeout=12,
            )
            payload = json.loads(raw.decode("utf-8", errors="replace"))
            media = _parse_graphql_payload(payload)
            if media:
                return media
        except Exception:
            continue
    return None


def _walk_video_urls(value: Any, found: list[str]) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            key_lower = str(key).lower()
            if key_lower in {"video_url", "url"} and isinstance(item, str) and _looks_like_video(item):
                found.append(item)
            elif isinstance(item, (dict, list)):
                _walk_video_urls(item, found)
    elif isinstance(value, list):
        for item in value:
            _walk_video_urls(item, found)


def _looks_like_video(url: str) -> bool:
    lower = str(url or "").lower()
    return lower.startswith(("http://", "https://")) and (
        ".mp4" in lower or ".m3u8" in lower or "/video/" in lower or "video_url" in lower or "playable_url" in lower
    )


def _clean(value: str) -> str:
    return html.unescape(str(value or "")).replace("\\u0026", "&").replace("\\/", "/").strip().strip('"').strip("'")


def _video_payload(media: dict[str, Any], *, source: str) -> dict[str, Any] | None:
    found: list[str] = []
    _walk_video_urls(media, found)
    cleaned = list(dict.fromkeys(_clean(url) for url in found if _clean(url)))
    if not cleaned:
        return None
    dimensions = media.get("dimensions") if isinstance(media.get("dimensions"), dict) else {}
    if not dimensions and isinstance(media.get("image_versions2"), dict):
        candidates = media["image_versions2"].get("candidates") or []
        dimensions = candidates[0] if candidates and isinstance(candidates[0], dict) else {}
    caption = media.get("caption")
    if isinstance(caption, dict):
        title = str(caption.get("text") or "").strip()
    else:
        title = str(caption or "").strip()
    thumb = media.get("display_url") or media.get("thumbnail_src") or ""
    if not thumb and isinstance(media.get("image_versions2"), dict):
        candidates = media["image_versions2"].get("candidates") or []
        thumb = candidates[0].get("url") if candidates and isinstance(candidates[0], dict) else ""
    return {
        "ok": True,
        "videoUrl": cleaned[0],
        "videoUrls": cleaned,
        "title": title[:180] or "Instagram Video",
        "thumbnail": thumb,
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
                return {
                    "ok": True,
                    "videoUrl": candidate,
                    "title": "Instagram Video",
                    "thumbnail": "",
                    "duration": 0,
                    "width": 0,
                    "height": 0,
                    "source": "instagram-embed",
                }
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
        carousel = media.get("carousel_media") if isinstance(media, dict) else None
        if isinstance(carousel, list):
            for child in carousel:
                if isinstance(child, dict):
                    result = _video_payload(child, source="instagram-graphql-carousel")
                    if result:
                        return result
        edges = ((media.get("edge_sidecar_to_children") or {}).get("edges") or []) if isinstance(media, dict) else []
        for edge in edges:
            child = edge.get("node") if isinstance(edge, dict) else None
            if isinstance(child, dict):
                result = _video_payload(child, source="instagram-graphql-carousel")
                if result:
                    return result

    result = _embed(shortcode)
    if result:
        return result

    # Some public Instagram posts are still available to public downloader
    # services even when Instagram blocks their direct anonymous web API calls.
    # Keep this last in the first-party public resolver so it is a resilience
    # fallback, not the primary dependency.
    try:
        from server_modules import audioflix_instagram_public_proxy
        proxy_result = audioflix_instagram_public_proxy.resolve_public(
            f"https://www.instagram.com/p/{shortcode}/"
        )
        if proxy_result.get("ok"):
            return proxy_result
    except Exception:
        pass

    return {
        "ok": False,
        "reason": "Instagram public media endpoints did not expose a playable video.",
    }
