"""Instagram Reel collection metadata for Audioflix.

Raw URL imports stay useful without this bridge. Localhost enriches public/reachable
entries through yt-dlp and leaves inaccessible entries intact instead of dropping them.
"""

from __future__ import annotations

import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

_REEL_RE = re.compile(
    r"https?://(?:www\.)?instagram\.com/(reel|reels|p|tv)/([A-Za-z0-9_-]+)",
    re.IGNORECASE,
)
_MAX_ITEMS = 250


def _ydl_options() -> dict:
    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "source_address": "0.0.0.0",
    }
    configured = os.environ.get("EVEOS_INSTAGRAM_COOKIES", "").strip()
    fallback = Path(__file__).resolve().parents[1] / "data" / "runtime" / "instagram-cookies.txt"
    cookie_file = Path(configured).expanduser() if configured else fallback
    if cookie_file.is_file():
        options["cookiefile"] = str(cookie_file)
    return options


def parse_urls(value) -> list[str]:
    seen = set()
    urls = []
    for kind, code in _REEL_RE.findall(str(value or "")):
        normalized_kind = "reel" if kind.lower() == "reels" else kind.lower()
        canonical = f"https://www.instagram.com/{normalized_kind}/{code}/"
        if canonical not in seen:
            seen.add(canonical)
            urls.append(canonical)
        if len(urls) >= _MAX_ITEMS:
            break
    return urls


def _code(url: str) -> str:
    match = _REEL_RE.search(url)
    return match.group(2) if match else ""


def _fallback(url: str, position: int, reason: str = "") -> dict:
    return {
        "sourceId": _code(url),
        "title": f"Instagram Reel {position}",
        "url": url,
        "position": position,
        "sourceProvider": "instagram",
        "metadataWarning": reason[:240],
    }


def _display_title(info: dict, position: int) -> str:
    raw = info.get("title") or info.get("description") or f"Instagram Reel {position}"
    clean = " ".join(str(raw).split())
    return clean[:180] or f"Instagram Reel {position}"


def _extract_one(pair) -> dict:
    position, url = pair
    from server_modules import audioflix_ytdl

    yt_dlp = audioflix_ytdl._get_yt_dlp()
    if yt_dlp is None:
        return _fallback(url, position, "yt-dlp is not installed.")
    options = _ydl_options()
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False) or {}
        return {
            "sourceId": _code(url),
            "title": _display_title(info, position),
            "artist": info.get("uploader") or info.get("channel") or "",
            "url": url,
            "image": info.get("thumbnail") or "",
            "duration": info.get("duration") or 0,
            "position": position,
            "sourceProvider": "instagram",
        }
    except Exception as exc:  # noqa: BLE001
        return _fallback(url, position, str(exc))


def list_collection(payload: dict) -> dict:
    urls = parse_urls(payload.get("source"))
    if not urls:
        return {"ok": False, "reason": "No Instagram Reel URLs were found."}
    pairs = list(enumerate(urls, 1))
    with ThreadPoolExecutor(max_workers=min(4, len(pairs))) as pool:
        entries = list(pool.map(_extract_one, pairs))
    title = str(payload.get("title") or "Instagram Reels").strip() or "Instagram Reels"
    return {
        "ok": True,
        "title": title,
        "playlistId": "instagram:" + ",".join(_code(url) for url in urls),
        "entries": entries,
        "scrapeSource": "yt-dlp",
    }


def resolve_video(payload: dict) -> dict:
    url = parse_urls(payload.get("url"))
    if not url:
        return {"ok": False, "reason": "No Instagram Reel URL was provided."}
    from server_modules import audioflix_ytdl

    yt_dlp = audioflix_ytdl._get_yt_dlp()
    if yt_dlp is None:
        return {"ok": False, "reason": "yt-dlp is not installed."}
    options = {
        **_ydl_options(),
        # The browser needs one progressive URL. A split video+audio selection cannot be
        # represented by a single <video src> without downloading and merging first.
        "format": "best[ext=mp4]/best",
    }
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url[0], download=False) or {}
        candidates = [info, *(info.get("requested_downloads") or []), *(info.get("formats") or [])]
        playable = [
            item for item in candidates
            if item.get("url")
            and item.get("vcodec", "none") != "none"
            and item.get("acodec", "none") != "none"
            and str(item.get("protocol") or "https").startswith(("http", "m3u8"))
        ]
        playable.sort(
            key=lambda item: (item.get("ext") == "mp4", item.get("height") or 0, item.get("tbr") or 0),
            reverse=True,
        )
        selected = playable[0] if playable else {}
        video_url = selected.get("url")
        if not video_url:
            return {"ok": False, "reason": "Instagram did not expose a progressive video stream with audio."}
        return {
            "ok": True,
            "videoUrl": video_url,
            "title": info.get("title") or "Instagram Reel",
            "duration": info.get("duration") or 0,
            "width": selected.get("width") or info.get("width") or 0,
            "height": selected.get("height") or info.get("height") or 0,
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "reason": str(exc)[:300]}
