"""Import-time Instagram media resolution for Audioflix.

A library import is the expensive boundary: provider extraction, including the
browser fallback, happens here once so ordinary playback can use the resolved
media URL without re-running metadata or Camofox work on every click.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor


_MAX_ITEMS = 250


def _parse_urls(value) -> list[str]:
    from server_modules.audioflix_instagram import parse_urls
    return parse_urls(value)[:_MAX_ITEMS]


def _code(url: str) -> str:
    from server_modules.audioflix_instagram import _code
    return _code(url)


def _resolve_one(pair: tuple[int, str]) -> dict:
    position, url = pair
    from server_modules import audioflix_instagram_playback

    result = audioflix_instagram_playback.resolve_video({"url": url})
    entry = {
        "sourceId": _code(url),
        "title": str(result.get("title") or f"Instagram Video {position}").strip()[:180],
        "artist": str(result.get("artist") or "").strip()[:120],
        "album": "",
        "url": url,
        "image": str(result.get("thumbnail") or "").strip(),
        "duration": float(result.get("duration") or 0) or 0,
        "position": position,
        "sourceProvider": "instagram",
        "resolvedVideoUrl": str(result.get("videoUrl") or "").strip(),
        "resolvedDuration": float(result.get("duration") or 0) or 0,
        "resolvedWidth": int(result.get("width") or 0) or 0,
        "resolvedHeight": int(result.get("height") or 0) or 0,
        "resolvedSource": str(result.get("source") or "").strip(),
    }
    if not result.get("ok"):
        entry["metadataWarning"] = str(result.get("reason") or "Instagram media could not be resolved.")[:240]
    return entry


def list_collection(payload: dict) -> dict:
    urls = _parse_urls(payload.get("source"))
    if not urls:
        return {"ok": False, "reason": "No Instagram video URLs were found."}

    title = str(payload.get("title") or "Instagram Videos").strip() or "Instagram Videos"
    pairs = list(enumerate(urls, 1))
    with ThreadPoolExecutor(max_workers=min(4, len(pairs))) as pool:
        entries = list(pool.map(_resolve_one, pairs))

    resolved = sum(1 for entry in entries if entry.get("resolvedVideoUrl"))
    return {
        "ok": True,
        "title": title,
        "playlistId": "instagram:" + ",".join(_code(url) for url in urls),
        "entries": entries,
        "scrapeSource": "instagram-import-resolver",
        "resolvedCount": resolved,
        "totalCount": len(entries),
    }