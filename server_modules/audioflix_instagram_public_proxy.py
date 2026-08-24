"""Last-resort public Instagram media proxy adapter for Audioflix.

This adapter intentionally avoids Instagram account credentials. It uses a public
web downloader-style endpoint only after EveOS's first-party public extraction
strategies have failed. Metadata is extracted from the downloader response too,
because Instagram itself may return an anonymous/age-gated shell while a public
media resolver can still expose the attribution needed by the library.
"""

from __future__ import annotations

import base64
import html
import http.cookiejar
import json
import os
import re
from urllib.parse import quote, urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen

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
    patterns = (
        r'href=["\'](https://[^\s"\'<>]+\.mp4[^\s"\'<>]*)["\']',
        r'src=["\'](https://[^\s"\'<>]+\.mp4[^\s"\'<>]*)["\']',
        r'(?i)(?:videoUrl|video_url|downloadUrl|download_url|contentUrl)\s*["\']?\s*[:=]\s*["\']([^"\']+)',
        r'https://[^\s"\']+\.(?:mp4|m3u8)(?:\?[^\s"\']*)?',
    )
    for pattern in patterns:
        candidates.extend(re.findall(pattern, body))
    return candidates


def _extract_duration_from_url(url: str) -> int:
    match = re.search(r'[?&]efg=([a-zA-Z0-9_\-=]+)', url)
    if not match:
        return 0
    try:
        padded = match.group(1) + '=' * (-len(match.group(1)) % 4)
        decoded = base64.b64decode(padded.replace('-', '+').replace('_', '/'))
        payload = json.loads(decoded.decode('utf-8', errors='replace'))
        return int(payload.get("duration_s") or 0) if isinstance(payload, dict) else 0
    except Exception:
        return 0


def _extract_thumbnail_from_html(html_text: str) -> str:
    for img in re.findall(r'<img[^>]+src=["\'](https://[^\s"\'<>]*)["\']', html_text, re.IGNORECASE):
        value = html.unescape(img)
        if "fetch?url=" in value:
            from urllib.parse import parse_qs, urlparse
            parsed = parse_qs(urlparse(value).query)
            if parsed.get("url"):
                return _clean(parsed["url"][0])
        if ("fbcdn.net" in value or "cdninstagram.com" in value) and "indown" not in value:
            return _clean(value)
    return ""


def _music_metadata_from_page(page: str) -> dict:
    """Extract music attribution from embedded JSON used by public pages."""
    if not page:
        return {}
    object_patterns = (
        r'"clips_music_attribution_info"\s*:\s*(\{.*?\})\s*(?:,|})',
        r'"music_metadata"\s*:\s*(\{.*?\})\s*(?:,|})',
        r'"audio_metadata"\s*:\s*(\{.*?\})\s*(?:,|})',
    )
    for pattern in object_patterns:
        for raw in re.findall(pattern, page, flags=re.DOTALL):
            try:
                payload = json.loads(raw)
            except (TypeError, ValueError):
                continue
            if not isinstance(payload, dict):
                continue
            artist = str(payload.get("artist_name") or payload.get("artist") or payload.get("artistName") or payload.get("audio_artist") or "").strip()
            song = str(payload.get("song_name") or payload.get("song") or payload.get("songName") or payload.get("title") or payload.get("audio_title") or "").strip()
            audio_id = str(payload.get("audio_id") or payload.get("audioId") or payload.get("music_asset_id") or "").strip()
            if artist or song or audio_id:
                return {"musicTitle": song[:180], "musicArtist": artist[:180], "musicId": audio_id[:120], "musicIsOriginal": payload.get("uses_original_sound")}

    def field(pattern: str) -> str:
        match = re.search(pattern, page, flags=re.IGNORECASE)
        return html.unescape(match.group(1)).strip() if match else ""

    song = field(r'\\?"(?:song_name|songName|audio_title)\\?"\s*:\s*\\?"([^"\\\r\n]+)')
    artist = field(r'\\?"(?:artist_name|artistName|audio_artist)\\?"\s*:\s*\\?"([^"\\\r\n]+)')
    audio_id = field(r'\\?"(?:audio_id|audioId|music_asset_id)\\?"\s*:\s*\\?"([^"\\\r\n]+)')
    if song or artist or audio_id:
        return {"musicTitle": song[:180], "musicArtist": artist[:180], "musicId": audio_id[:120]}
    return {}


def _visible_metadata_from_download_page(page: str) -> dict:
    """Read attribution from the downloader result itself.

    Instagram can block the direct page from anonymous clients, but downloader
    pages often retain the post's rendered attribution, e.g.:
    `A post shared by Xarzzu (@xarzzu)` + `Original audio`.
    """
    if not page:
        return {}
    try:
        from server_modules.audioflix_instagram_metadata import _metadata_from_html
        metadata = _metadata_from_html(page)
    except Exception:
        metadata = {}

    # Some downloader templates expose only plain text, so supplement the
    # normal Instagram/embed parser with a small visible-text pass.
    clean = re.sub(r"<script\b[^>]*>.*?</script>", " ", page, flags=re.IGNORECASE | re.DOTALL)
    clean = re.sub(r"<style\b[^>]*>.*?</style>", " ", clean, flags=re.IGNORECASE | re.DOTALL)
    clean = html.unescape(re.sub(r"<[^>]+>", " ", clean))
    clean = " ".join(clean.split())

    creator = str(metadata.get("creator") or "").strip()
    display_name = str(metadata.get("creatorDisplayName") or "").strip()
    if not creator:
        handle = re.search(r"@([A-Za-z0-9._]{1,30})\b", clean)
        creator = handle.group(1).lower() if handle else ""
    if not display_name:
        author = re.search(r"(?:A post shared by|shared by)\s+([^(@]{1,120}?)\s*\(@", clean, re.IGNORECASE)
        display_name = author.group(1).strip() if author else ""

    original_audio = bool(re.search(r"\bOriginal audio\b|\boriginal sound\b", clean, re.IGNORECASE))
    if original_audio:
        metadata["creator"] = creator or metadata.get("creator") or ""
        metadata["creatorDisplayName"] = display_name or metadata.get("creatorDisplayName") or ""
        metadata["audioKind"] = "original_audio"
        metadata["audioTitle"] = metadata.get("audioTitle") or f"Original audio — {creator or display_name or 'Instagram'}"
        metadata["audioArtist"] = metadata.get("audioArtist") or creator or display_name or ""
        metadata["title"] = metadata.get("title") or metadata["audioTitle"]
        metadata["artist"] = metadata.get("artist") or creator or display_name or "Instagram"
    elif creator or display_name:
        metadata["creator"] = creator or metadata.get("creator") or ""
        metadata["creatorDisplayName"] = display_name or metadata.get("creatorDisplayName") or ""
        metadata["artist"] = metadata.get("artist") or creator or display_name
        if metadata.get("title") in (None, "", "Instagram Video"):
            metadata["title"] = display_name or creator

    return metadata


def _enrich_with_music(result: dict, url: str) -> dict:
    """Best-effort enrichment from Instagram itself; never required for media."""
    try:
        request = Request(url, headers={
            "User-Agent": _USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.instagram.com/",
        })
        with urlopen(request, timeout=10) as response:
            page = response.read(_MAX_BODY).decode("utf-8", errors="replace")
        metadata = _music_metadata_from_page(page)
        if metadata:
            result.update(metadata)
            if metadata.get("musicTitle"):
                result["title"] = metadata["musicTitle"]
            if metadata.get("musicArtist"):
                result["artist"] = metadata["musicArtist"]
            result["metadataSource"] = "instagram-public-page"
    except Exception:
        pass
    return result


def _apply_download_metadata(result: dict, page: str) -> dict:
    metadata = _visible_metadata_from_download_page(page)
    if not metadata:
        return result
    mapping = {
        "creator": "creator",
        "creatorDisplayName": "creatorDisplayName",
        "collaborators": "collaborators",
        "audioTitle": "audioTitle",
        "audioArtist": "audioArtist",
        "audioKind": "audioKind",
        "caption": "caption",
        "permalink": "permalink",
    }
    for target, source in mapping.items():
        if metadata.get(source):
            result[target] = metadata[source]
    if metadata.get("thumbnail") and not result.get("thumbnail"):
        result["thumbnail"] = metadata["thumbnail"]
    if metadata.get("title") and result.get("title") in (None, "", "Instagram Video"):
        result["title"] = metadata["title"][:180]
    if metadata.get("artist") and result.get("artist") in (None, "", "Instagram"):
        result["artist"] = metadata["artist"][:120]
    if metadata.get("creator") or metadata.get("audioTitle"):
        result["metadataSource"] = "instagram-public-proxy-page"
    return result


def _indown_resolve(url: str) -> dict | None:
    try:
        jar = http.cookiejar.CookieJar()
        opener = build_opener(HTTPCookieProcessor(jar))
        headers = {
            "User-Agent": _USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        with opener.open(Request("https://indown.io/en2", headers=headers), timeout=15) as response:
            landing = response.read(_MAX_BODY).decode("utf-8", errors="replace")

        token_match = re.search(r'name=["\']_token["\']\s+value=["\']([^"\']+)["\']', landing)
        if not token_match:
            token_match = re.search(r'value=["\']([^"\']+)["\']\s+name=["\']_token["\']', landing)
        token = token_match.group(1) if token_match else ""
        post_data = urlencode({"referer": "https://indown.io/en2", "locale": "en", "_token": token, "link": url, "e": "e"}).encode("utf-8")
        post_headers = {**headers, "Content-Type": "application/x-www-form-urlencoded", "Origin": "https://indown.io", "Referer": "https://indown.io/en2"}
        with opener.open(Request("https://indown.io/download", data=post_data, headers=post_headers, method="POST"), timeout=15) as response:
            page = response.read(_MAX_BODY).decode("utf-8", errors="replace")

        thumbnail = _extract_thumbnail_from_html(page)
        candidates = _extract_candidates(page)
        for candidate in candidates:
            candidate = _clean(candidate)
            if not _looks_like_video(candidate):
                continue
            result = {
                "ok": True,
                "videoUrl": candidate,
                "title": "Instagram Video",
                "artist": "Instagram",
                "thumbnail": thumbnail,
                "duration": _extract_duration_from_url(candidate),
                "width": 0,
                "height": 0,
                "source": "instagram-public-proxy",
            }
            result = _apply_download_metadata(result, page)
            return _enrich_with_music(result, url)
    except Exception:
        pass
    return None


def resolve_public(url: str) -> dict:
    custom_template = (os.environ.get("EVEOS_INSTAGRAM_PUBLIC_PROXY_URL") or "").strip()
    if custom_template:
        endpoint = custom_template.format(url=quote(url, safe=""))
        request = Request(endpoint, headers={"User-Agent": _USER_AGENT, "Accept": "application/json,text/html,*/*;q=0.8", "Referer": "https://www.instagram.com/"})
        try:
            with urlopen(request, timeout=15) as response:
                final_url = response.geturl()
                content_type = str(response.headers.get("Content-Type") or "").lower()
                if _looks_like_video(final_url) or content_type.startswith("video/"):
                    return _enrich_with_music({"ok": True, "videoUrl": final_url, "title": "Instagram Video", "artist": "Instagram", "thumbnail": "", "duration": 0, "width": 0, "height": 0, "source": "instagram-public-proxy"}, url)
                body = response.read(_MAX_BODY).decode("utf-8", errors="replace")
                candidates = _extract_candidates(body)
                for candidate in candidates:
                    candidate = _clean(candidate)
                    if _looks_like_video(candidate):
                        result = {"ok": True, "videoUrl": candidate, "title": "Instagram Video", "artist": "Instagram", "thumbnail": "", "duration": _extract_duration_from_url(candidate), "width": 0, "height": 0, "source": "instagram-public-proxy"}
                        result = _apply_download_metadata(result, body)
                        return _enrich_with_music(result, url)
        except Exception as exc:
            return {"ok": False, "reason": f"Custom public Instagram proxy failed: {str(exc)[:220]}"}

    result = _indown_resolve(url)
    if result:
        return result
    return {"ok": False, "reason": "Public Instagram proxy did not expose a playable video URL."}
