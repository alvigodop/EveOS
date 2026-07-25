"""yt-dlp backed URL → direct-audio-stream resolver for Audioflix.

Exposes a single function ``resolve(url)`` that returns a dict with the best
audio-only stream URL for a given video/audio platform link (YouTube, SoundCloud,
Bandcamp, etc.).  Results are cached in-memory with a 4-hour TTL since YouTube
stream URLs typically expire after ~6 hours.

The module is designed to be imported lazily so yt-dlp is only loaded when the
first resolve request arrives.
"""

from __future__ import annotations

import logging
import threading
import time
from http import HTTPStatus
from urllib.parse import parse_qs, urlparse

logger = logging.getLogger("EveOSAudioflixYTDL")

# ---------------------------------------------------------------------------
# In-memory cache: url → {result_dict, expires_at}
# ---------------------------------------------------------------------------
_cache: dict[str, dict] = {}
_CACHE_TTL_S = 15 * 60  # 15 minutes
_MAX_CACHE = 200
_cache_lock = threading.Lock()


def _cache_get(url: str) -> dict | None:
    with _cache_lock:
        entry = _cache.get(url)
        if entry and entry["expires_at"] > time.monotonic():
            return entry["result"]
        if entry:
            del _cache[url]
    return None


def _cache_set(url: str, result: dict) -> None:
    with _cache_lock:
        if len(_cache) >= _MAX_CACHE:
            # evict oldest
            oldest_key = min(_cache, key=lambda k: _cache[k]["expires_at"])
            del _cache[oldest_key]
        _cache[url] = {"result": result, "expires_at": time.monotonic() + _CACHE_TTL_S}


# ---------------------------------------------------------------------------
# yt-dlp extraction (lazy import)
# ---------------------------------------------------------------------------
_yt_dlp = None
_yt_dlp_lock = threading.Lock()
_yt_dlp_available: bool | None = None  # None = not checked yet


def _get_yt_dlp():
    global _yt_dlp, _yt_dlp_available
    if _yt_dlp_available is False:
        return None
    with _yt_dlp_lock:
        if _yt_dlp is not None:
            return _yt_dlp
        try:
            import yt_dlp  # type: ignore
            _yt_dlp = yt_dlp
            _yt_dlp_available = True
            version_str = getattr(getattr(yt_dlp, "version", None), "__version__", "?")
            logger.info("yt-dlp loaded successfully (version %s)", version_str)
            return _yt_dlp
        except ImportError:
            _yt_dlp_available = False
            logger.warning("yt-dlp is not installed — /api/audioflix/resolve-url will be unavailable")
            return None


def resolve(url: str, force: bool = False) -> dict:
    """Extract the best audio stream URL from a platform link.

    Returns ``{"ok": True, "audioUrl": "...", "title": "...", ...}`` on success
    or ``{"ok": False, "reason": "..."}`` on failure.
    """
    if not force:
        cached = _cache_get(url)
        if cached is not None:
            return cached

    yt_dlp = _get_yt_dlp()
    if yt_dlp is None:
        return {"ok": False, "reason": "yt-dlp is not installed on this system."}

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        # Prefer audio-only formats; fall back to best available
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "noplaylist": True,
        "source_address": "0.0.0.0",
        "extractor_args": {"youtube": {"player_client": ["web", "mweb", "android"]}}
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info is None:
                return {"ok": False, "reason": "yt-dlp returned no info for this URL."}

            audio_url = info.get("url")
            if not audio_url:
                # Some extractors put the URL in 'requested_downloads'
                downloads = info.get("requested_downloads") or []
                if downloads:
                    audio_url = downloads[0].get("url")

            if not audio_url:
                return {"ok": False, "reason": "Could not extract a direct audio URL."}

            result = {
                "ok": True,
                "audioUrl": audio_url,
                "title": info.get("title") or "",
                "duration": info.get("duration") or 0,
                "thumbnail": info.get("thumbnail") or "",
                "uploader": info.get("uploader") or "",
                "ext": info.get("ext") or "",
            }
            _cache_set(url, result)
            logger.info("Resolved audio URL for: %s → %s (ext=%s, dur=%ss)",
                        url[:80], audio_url[:60] + "...", result["ext"], result["duration"])
            return result

    except Exception as exc:
        logger.warning("yt-dlp extraction failed for %s: %s", url, exc)
        return {"ok": False, "reason": str(exc)[:300]}


# ---------------------------------------------------------------------------
# HTTP handler (called from audioflix_bridge)
# ---------------------------------------------------------------------------

def handle_resolve_request(handler, query) -> None:
    """Handle GET /api/audioflix/resolve-url?url=...&force=1"""
    import json

    url_list = query.get("url")
    if not url_list:
        body = json.dumps({"ok": False, "reason": "Missing 'url' query parameter."}).encode("utf-8")
        handler.send_response(HTTPStatus.BAD_REQUEST)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)
        return

    target_url = url_list[0]
    force_val = str((query.get("force") or [""])[0]).lower() in {"1", "true", "yes"}
    result = resolve(target_url, force=force_val)

    status = HTTPStatus.OK if result.get("ok") else HTTPStatus.UNPROCESSABLE_ENTITY
    body = json.dumps(result).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)
