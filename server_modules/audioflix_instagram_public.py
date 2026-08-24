"""Public, no-login Instagram media extraction for Audioflix.

The resolver deliberately avoids Instagram credentials. It uses Instagram's
logged-out Polaris web flow first, then the older public web representations,
then the configurable public media proxy. Browser rendering remains a final
fallback in the caller.
"""

from __future__ import annotations

import html
import http.cookiejar
import json
import os
import re
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, build_opener

_APP_ID = "936619743392459"
_LOGGED_OUT_DOC_ID = "27130156389949648"
_CURRENT_DOC_ID = "27128499623469141"
_LEGACY_DOC_ID = "8845758582119845"
_LOGGED_OUT_QUERY_NAME = "PolarisLoggedOutDesktopWWWPostRootContentQuery"
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


def _headers(csrf: str = "", *, lsd: str = "") -> dict[str, str]:
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
    if lsd:
        headers["X-FB-LSD"] = lsd
    return headers


def _new_session():
    jar = http.cookiejar.CookieJar()
    return build_opener(__import__("urllib.request", fromlist=["HTTPCookieProcessor"]).HTTPCookieProcessor(jar)), jar


def _request(url: str, *, method: str = "GET", body: bytes | None = None, headers: dict[str, str] | None = None, timeout: int = 12, opener=None) -> bytes:
    request = Request(url, data=body, headers=headers or _headers(), method=method)
    if opener is not None:
        with opener.open(request, timeout=timeout) as response:
            return response.read()
    with __import__("urllib.request", fromlist=["urlopen"]).urlopen(request, timeout=timeout) as response:
        return response.read()


def _extract_lsd(homepage: str) -> str:
    patterns = (
        r'\["LSD",\[\],\{"token":"([^"]+)"',
        r'"LSD",\[\],\{"token":"([^"]+)"',
    )
    for pattern in patterns:
        match = re.search(pattern, homepage)
        if match:
            return match.group(1)
    match = re.search(r'<script\b[^>]*\bid=["\']__eqmc["\'][^>]*>(.*?)</script>', homepage, re.DOTALL)
    if match:
        try:
            payload = json.loads(match.group(1))
            token = payload.get("l")
            if isinstance(token, str):
                return token
        except (TypeError, ValueError):
            pass
    return ""


def _bootstrap_logged_out_session(opener, shortcode: str) -> tuple[str, str]:
    homepage = _request(
        "https://www.instagram.com/",
        headers=_headers(),
        timeout=12,
        opener=opener,
    ).decode("utf-8", errors="replace")
    lsd = _extract_lsd(homepage)
    media_id = str(shortcode_to_pk(shortcode))
    ruling_url = "https://i.instagram.com/api/v1/web/get_ruling_for_content/?" + urlencode({
        "content_type": "MEDIA",
        "target_id": media_id,
    })
    ruling = json.loads(_request(ruling_url, headers=_headers(), timeout=12, opener=opener).decode("utf-8", errors="replace"))
    if ruling.get("status") != "ok":
        return lsd, ""
    return lsd, media_id


def _logged_out_polaris(shortcode: str) -> dict[str, Any] | None:
    try:
        opener, jar = _new_session()
        lsd, media_id = _bootstrap_logged_out_session(opener, shortcode)
        if not lsd or not media_id:
            return None
        csrf = ""
        for cookie in jar:
            if cookie.name == "csrftoken":
                csrf = cookie.value
                break
        headers = _headers(csrf, lsd=lsd)
        headers.update({
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            "X-FB-Friendly-Name": _LOGGED_OUT_QUERY_NAME,
            "Referer": f"https://www.instagram.com/p/{shortcode}/",
        })
        payload = {
            "lsd": lsd,
            "fb_api_caller_class": "RelayModern",
            "fb_api_req_friendly_name": _LOGGED_OUT_QUERY_NAME,
            "server_timestamps": "true",
            "variables": json.dumps({"media_id": media_id}, separators=(",", ":")),
            "doc_id": _LOGGED_OUT_DOC_ID,
        }
        raw = _request(
            "https://www.instagram.com/api/graphql",
            method="POST",
            body=urlencode(payload).encode("utf-8"),
            headers=headers,
            timeout=12,
            opener=opener,
        )
        response = json.loads(raw.decode("utf-8", errors="replace"))
        media = (response.get("data") or {}).get("xig_polaris_media") or {}
        product = media.get("if_not_gated_logged_out") or {}
        if not isinstance(product, dict) or not product:
            return None
        result = _video_payload(product, source="instagram-polaris-logged-out")
        if result:
            return result
        for child in product.get("carousel_media") or []:
            if isinstance(child, dict):
                result = _video_payload(child, source="instagram-polaris-logged-out-carousel")
                if result:
                    return result
        for edge in ((product.get("edge_sidecar_to_children") or {}).get("edges") or []):
            child = edge.get("node") if isinstance(edge, dict) else None
            if isinstance(child, dict):
                result = _video_payload(child, source="instagram-polaris-logged-out-carousel")
                if result:
                    return result
        return None
    except Exception:
        return None


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
    variables = {"shortcode": shortcode, "__relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider": False}
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
            raw = _request("https://www.instagram.com/graphql/query/", method="POST", body=form, headers=headers, timeout=12)
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


from server_modules.audioflix_instagram_metadata import (
    _clean,
    _first_string,
    _metadata_from_html,
    _metadata_from_media,
    _user_metadata,
    resolve_metadata,
)


def _video_payload(media: dict[str, Any], *, source: str) -> dict[str, Any] | None:
    found: list[str] = []
    _walk_video_urls(media, found)
    for version in media.get("video_versions") or []:
        if isinstance(version, dict) and isinstance(version.get("url"), str):
            found.append(version["url"])
    cleaned = list(dict.fromkeys(_clean(url) for url in found if _clean(url)))
    if not cleaned:
        return None
    dimensions = media.get("dimensions") if isinstance(media.get("dimensions"), dict) else {}
    if not dimensions and isinstance(media.get("image_versions2"), dict):
        candidates = media["image_versions2"].get("candidates") or []
        dimensions = candidates[0] if candidates and isinstance(candidates[0], dict) else {}
    thumb = media.get("display_url") or media.get("thumbnail_src") or ""
    if not thumb and isinstance(media.get("image_versions2"), dict):
        candidates = media["image_versions2"].get("candidates") or []
        thumb = candidates[0].get("url") if candidates and isinstance(candidates[0], dict) else ""
    metadata = _metadata_from_media(media)
    return {
        "ok": True,
        "videoUrl": cleaned[0],
        "videoUrls": cleaned,
        "title": metadata["title"] or "Instagram Video",
        "artist": metadata["artist"],
        "creator": metadata["creator"],
        "creatorDisplayName": metadata["creatorDisplayName"],
        "collaborators": metadata["collaborators"],
        "audioTitle": metadata["audioTitle"],
        "audioArtist": metadata["audioArtist"],
        "audioKind": metadata["audioKind"],
        "caption": metadata["caption"],
        "permalink": metadata["permalink"],
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
                metadata = _metadata_from_html(page)
                return {
                    "ok": True,
                    "videoUrl": candidate,
                    "title": metadata.get("title") or "Instagram Video",
                    "artist": metadata.get("artist") or "Instagram",
                    "creator": metadata.get("creator") or "",
                    "creatorDisplayName": metadata.get("creatorDisplayName") or "",
                    "collaborators": metadata.get("collaborators") or [],
                    "audioTitle": metadata.get("audioTitle") or "",
                    "audioArtist": metadata.get("audioArtist") or "",
                    "audioKind": metadata.get("audioKind") or "",
                    "caption": metadata.get("caption") or "",
                    "permalink": metadata.get("permalink") or f"https://www.instagram.com/p/{shortcode}/",
                    "thumbnail": metadata.get("thumbnail") or "",
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

    result = _logged_out_polaris(shortcode)
    if result:
        return result

    csrf = ""
    media = _graphql(shortcode, csrf)
    if media:
        result = _video_payload(media, source="instagram-graphql")
        if result:
            return result
        for child in media.get("carousel_media") or []:
            if isinstance(child, dict):
                result = _video_payload(child, source="instagram-graphql-carousel")
                if result:
                    return result
        for edge in ((media.get("edge_sidecar_to_children") or {}).get("edges") or []):
            child = edge.get("node") if isinstance(edge, dict) else None
            if isinstance(child, dict):
                result = _video_payload(child, source="instagram-graphql-carousel")
                if result:
                    return result

    result = _embed(shortcode)
    if result:
        return result

    try:
        from server_modules import audioflix_instagram_public_proxy
        proxy_result = audioflix_instagram_public_proxy.resolve_public(f"https://www.instagram.com/p/{shortcode}/")
        if proxy_result.get("ok"):
            return proxy_result
    except Exception:
        pass

    return {"ok": False, "reason": "Instagram public media endpoints did not expose a playable video."}
