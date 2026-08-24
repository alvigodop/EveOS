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


def _clean(value: str) -> str:
    return html.unescape(str(value or "")).replace("\\u0026", "&").replace("\\/", "/").strip().strip('"').strip("'")


def _first_string(value: Any, keys: set[str]) -> str:
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() in keys and isinstance(item, str) and item.strip():
                return " ".join(item.split())
        for item in value.values():
            result = _first_string(item, keys)
            if result:
                return result
    elif isinstance(value, list):
        for item in value:
            result = _first_string(item, keys)
            if result:
                return result
    return ""


def _user_metadata(media: dict[str, Any]) -> tuple[str, str]:
    user = media.get("user") or media.get("owner") or {}
    username = ""
    display_name = ""
    if isinstance(user, dict):
        username = str(user.get("username") or user.get("handle") or "").strip().lstrip("@").lower()
        display_name = str(user.get("full_name") or user.get("name") or "").strip()
    if not username:
        username = _first_string(media, {"username", "user_name", "owner_username", "creator_username"}).lstrip("@").lower()
    if not display_name:
        display_name = _first_string(media, {"full_name", "display_name", "owner_name", "creator_name"})
    return username, display_name


def _collaborators(media: dict[str, Any]) -> list[str]:
    values: list[str] = []
    containers = [media.get("coauthor_producers"), media.get("collaborators"), media.get("co_authors")]
    for container in containers:
        if isinstance(container, dict):
            container = container.get("edges") or container.get("nodes") or container.get("data") or []
        if not isinstance(container, list):
            continue
        for item in container:
            node = item.get("node") if isinstance(item, dict) and isinstance(item.get("node"), dict) else item
            if isinstance(node, dict):
                name = str(node.get("username") or node.get("handle") or "").strip().lstrip("@").lower()
                if name and name not in values:
                    values.append(name)
    return values[:20]


def _metadata_from_media(media: dict[str, Any]) -> dict[str, Any]:
    username, display_name = _user_metadata(media)
    collaborators = _collaborators(media)
    caption = media.get("caption")
    caption_text = str(caption.get("text") if isinstance(caption, dict) else (caption or "")).strip()
    music = media.get("music_metadata") or media.get("music_info") or {}
    music_title = _first_string(music, {"title", "music_title", "song_name", "track_name"})
    music_artist = _first_string(music, {"display_artist", "artist_name", "artist", "music_artist", "performer"})
    audio_type = _first_string(media, {"audio_type", "audio_attribution_type"}).lower().replace("-", "_")
    original_title = _first_string(media, {"original_audio_title", "original_sound_title", "audio_title"})
    original_audio = "original" in audio_type or bool(original_title) or bool(media.get("original_audio"))

    if music_title and music_artist:
        title = music_title
        artist = music_artist
        audio_kind = "music"
    elif original_audio:
        owner = username or display_name or "Instagram"
        title = original_title or f"Original audio — {owner}"
        artist = username or display_name or "Instagram"
        audio_kind = "original_audio"
    elif caption_text:
        title = caption_text
        artist = username or display_name or "Instagram"
        audio_kind = ""
    else:
        title = display_name or username or "Instagram Video"
        artist = username or display_name or "Instagram"
        audio_kind = ""

    return {
        "creator": username,
        "creatorDisplayName": display_name,
        "collaborators": collaborators,
        "audioTitle": music_title or original_title,
        "audioArtist": music_artist or (username if original_audio else ""),
        "audioKind": audio_kind,
        "caption": caption_text,
        "title": title[:180],
        "artist": artist[:120],
        "permalink": str(media.get("permalink") or "").strip(),
    }


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


def _metadata_from_html(page: str) -> dict[str, Any]:
    def meta(*names: str) -> str:
        for name in names:
            pattern = rf'<meta[^>]+(?:property|name)=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']*)["\']'
            match = re.search(pattern, page, re.IGNORECASE)
            if match:
                return html.unescape(match.group(1)).strip()
            pattern = rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']{re.escape(name)}["\']'
            match = re.search(pattern, page, re.IGNORECASE)
            if match:
                return html.unescape(match.group(1)).strip()
        return ""

    description = meta("description", "og:description")
    creator = ""
    display_name = ""
    author_match = re.search(r'(?:A post shared by|shared by)\s+([^(@]+?)\s*\(@([A-Za-z0-9._]+)\)', description, re.IGNORECASE)
    if author_match:
        display_name = author_match.group(1).strip()
        creator = author_match.group(2).lower()
    elif "@" in description:
        handle = re.search(r'@([A-Za-z0-9._]+)', description)
        creator = handle.group(1).lower() if handle else ""
    caption = meta("og:title", "twitter:title")
    if caption.startswith("A post shared by"):
        caption = ""
    thumbnail = meta("og:image", "twitter:image")
    music_title = ""
    music_artist = ""
    music_match = re.search(r'(?:Original audio|original sound)\s*[—-]\s*([^|•]+)', description, re.IGNORECASE)
    if music_match:
        music_title = f"Original audio — {music_match.group(1).strip()}"
    original_audio = bool(music_match) or bool(re.search(r'Original audio', description, re.IGNORECASE))
    if original_audio:
        title = music_title or f"Original audio — {creator or display_name or 'Instagram'}"
        artist = creator or display_name or "Instagram"
        kind = "original_audio"
    else:
        title = caption or display_name or creator or "Instagram Video"
        artist = creator or display_name or "Instagram"
        kind = ""
    permalink = meta("og:url")
    return {
        "creator": creator,
        "creatorDisplayName": display_name,
        "collaborators": [],
        "audioTitle": music_title,
        "audioArtist": music_artist,
        "audioKind": kind,
        "caption": caption,
        "title": title[:180],
        "artist": artist[:120],
        "permalink": permalink,
        "thumbnail": thumbnail,
    }


def resolve_metadata(shortcode: str, *, fallback_url: str = "") -> dict[str, Any]:
    """Best-effort public metadata enrichment; never required for playback."""
    shortcode = str(shortcode or "").strip()
    if not shortcode:
        return {"ok": False, "reason": "Missing Instagram shortcode."}
    try:
        media = _graphql(shortcode, "")
        if media:
            metadata = _metadata_from_media(media)
            if metadata.get("creator") or metadata.get("audioTitle") or metadata.get("caption"):
                metadata.update({"ok": True, "thumbnail": media.get("display_url") or media.get("thumbnail_src") or ""})
                metadata["permalink"] = metadata.get("permalink") or fallback_url or f"https://www.instagram.com/p/{shortcode}/"
                return metadata
    except Exception:
        pass
    try:
        for prefix in ("p", "reel"):
            page = _request(f"https://www.instagram.com/{prefix}/{shortcode}/embed/", headers=_headers(), timeout=10).decode("utf-8", errors="replace")
            metadata = _metadata_from_html(page)
            if metadata.get("creator") or metadata.get("caption") or metadata.get("audioTitle"):
                metadata["ok"] = True
                metadata["permalink"] = metadata.get("permalink") or fallback_url or f"https://www.instagram.com/{prefix}/{shortcode}/"
                return metadata
    except Exception:
        pass
    return {"ok": False, "reason": "Public Instagram metadata was not available."}


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
