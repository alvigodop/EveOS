"""Public Instagram metadata extraction and enrichment for Audioflix.

Enriches track metadata with creator usernames, display names, collaborators,
catalog music, original audio, captions, and thumbnails when publicly available.
Metadata enrichment is completely decoupled from media stream resolution.
"""

from __future__ import annotations

import html
import json
import re
from typing import Any
from urllib.request import Request, urlopen


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
    music_match = re.search(r'(?:Original audio|original sound)\s*[—-–]\s*([^|•]+)', description, re.IGNORECASE)
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
        from server_modules import audioflix_instagram_public
        media = audioflix_instagram_public._graphql(shortcode, "")
        if media:
            metadata = _metadata_from_media(media)
            if metadata.get("creator") or metadata.get("audioTitle") or metadata.get("caption"):
                metadata.update({"ok": True, "thumbnail": media.get("display_url") or media.get("thumbnail_src") or ""})
                metadata["permalink"] = metadata.get("permalink") or fallback_url or f"https://www.instagram.com/p/{shortcode}/"
                return metadata
    except Exception:
        pass
    try:
        from server_modules import audioflix_instagram_public
        for prefix in ("p", "reel"):
            page = audioflix_instagram_public._request(f"https://www.instagram.com/{prefix}/{shortcode}/embed/", headers=audioflix_instagram_public._headers(), timeout=10).decode("utf-8", errors="replace")
            metadata = _metadata_from_html(page)
            if metadata.get("creator") or metadata.get("caption") or metadata.get("audioTitle"):
                metadata["ok"] = True
                metadata["permalink"] = metadata.get("permalink") or fallback_url or f"https://www.instagram.com/{prefix}/{shortcode}/"
                return metadata
    except Exception:
        pass
    return {"ok": False, "reason": "Public Instagram metadata was not available."}
