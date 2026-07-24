"""Live playlist listing for Audioflix (YouTube and any other yt-dlp playlist URL).

Audioflix imports a playlist as a GROUP of music tracks and keeps a live connection to it.
Re-listing is cheap because we use yt-dlp's flat extraction: it enumerates the playlist's
entries WITHOUT resolving a stream for each video (resolving happens lazily at play time via
audioflix_ytdl.resolve). A 200-track playlist lists in about one request instead of 200.

Public and unlisted playlists work (an unlisted URL still carries its list id); private ones
cannot be read without credentials and report a clear reason.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from http import HTTPStatus
from urllib.parse import parse_qs, urlparse

logger = logging.getLogger("EveOSAudioflixPlaylist")

# Live connection: a short TTL keeps repeated syncs cheap without hiding upstream edits for long.
_CACHE_TTL_S = 120
_MAX_CACHE = 50
_MAX_ENTRIES = 500
_cache: dict[str, dict] = {}
_cache_lock = threading.Lock()


def playlist_id_from_url(url: str) -> str:
    """Pull the list id out of a playlist URL ('' when there isn't one)."""
    try:
        parsed = urlparse(str(url or "").strip())
    except Exception:
        return ""
    if not parsed.scheme.startswith("http"):
        return ""
    listed = parse_qs(parsed.query or "").get("list")
    if listed and listed[0].strip():
        return listed[0].strip()
    # youtube.com/playlist/<id> style fallbacks
    parts = [p for p in (parsed.path or "").split("/") if p]
    if len(parts) >= 2 and parts[0] in {"playlist", "playlists"}:
        return parts[1]
    return ""


def _cache_get(key: str):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and entry["expires_at"] > time.monotonic():
            return entry["result"]
        if entry:
            del _cache[key]
    return None


def _cache_set(key: str, result: dict) -> None:
    with _cache_lock:
        if len(_cache) >= _MAX_CACHE:
            oldest = min(_cache, key=lambda k: _cache[k]["expires_at"])
            del _cache[oldest]
        _cache[key] = {"result": result, "expires_at": time.monotonic() + _CACHE_TTL_S}


def _entry_url(entry: dict) -> str:
    url = str(entry.get("url") or "").strip()
    entry_id = str(entry.get("id") or "").strip()
    if url.startswith("http"):
        return url
    if entry_id:
        return f"https://www.youtube.com/watch?v={entry_id}"
    return ""


def _safe_str(v) -> str:
    return str(v or "").encode("ascii", "backslashreplace").decode("ascii")


def list_playlist(url: str, force: bool = False) -> dict:
    """Return ``{ok, playlistId, title, entries:[{sourceId,title,url,artist,duration}]}``."""
    clean = str(url or "").strip()
    if not clean:
        return {"ok": False, "reason": "Missing playlist URL."}
    if not force:
        cached = _cache_get(clean)
        if cached is not None:
            return cached

    from server_modules import audioflix_ytdl

    yt_dlp = audioflix_ytdl._get_yt_dlp()  # reuses the same lazy import + availability check
    if yt_dlp is None:
        return {"ok": False, "reason": "yt-dlp is not installed on this system."}

    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        # Enumerate entries only — do NOT resolve a stream per video (that is the slow part).
        "extract_flat": "in_playlist",
        "playlistend": _MAX_ENTRIES,
    }
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(clean, download=False)
    except Exception as exc:  # noqa: BLE001 - surface any extractor error as a reason
        logger.warning("Playlist listing failed for %s: %s", _safe_str(clean), _safe_str(exc))
        return {"ok": False, "reason": f"Could not read that playlist: {exc}"}

    if not isinstance(info, dict):
        return {"ok": False, "reason": "yt-dlp returned no playlist info."}
    raw_entries = info.get("entries")
    if raw_entries is None:
        return {"ok": False, "reason": "That URL does not look like a playlist."}

    entries = []
    for entry in raw_entries:
        if not isinstance(entry, dict):
            continue
        source_id = str(entry.get("id") or "").strip()
        entry_url = _entry_url(entry)
        if not source_id or not entry_url:
            continue
        entries.append({
            "sourceId": source_id,
            "title": str(entry.get("title") or source_id).strip(),
            "url": entry_url,
            "artist": str(entry.get("uploader") or entry.get("channel") or "").strip(),
            "duration": float(entry.get("duration") or 0) or 0,
        })

    result = {
        "ok": True,
        "playlistId": str(info.get("id") or playlist_id_from_url(clean) or "").strip(),
        "title": str(info.get("title") or "Playlist").strip(),
        "uploader": str(info.get("uploader") or info.get("channel") or "").strip(),
        "count": len(entries),
        "entries": entries,
    }
    _cache_set(clean, result)
    return result


def handle_playlist_request(handler, query) -> None:
    """Handle GET /api/audioflix/playlist?url=...[&refresh=1]"""
    try:
        url_list = query.get("url") or []
        force = bool(query.get("refresh") or query.get("force"))
        if not url_list:
            payload = {"ok": False, "reason": "Missing 'url' query parameter."}
            status = HTTPStatus.BAD_REQUEST
        else:
            payload = list_playlist(url_list[0], force=force)
            status = HTTPStatus.OK if payload.get("ok") else HTTPStatus.OK
    except Exception as exc:
        payload = {"ok": False, "reason": f"Playlist request failed: {exc}"}
        status = HTTPStatus.INTERNAL_SERVER_ERROR
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)
