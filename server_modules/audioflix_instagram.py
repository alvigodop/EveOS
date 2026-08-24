"""Instagram public video extraction for Audioflix.

The primary path is yt-dlp. When Instagram's extractor returns an empty-media
response, EveOS uses Instagram's public GraphQL/embed/page representations.
No Instagram account, browser cookies, cookie export, or API key is required
for public media. Browser rendering remains a final fallback only.
"""

from __future__ import annotations

import html
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen

_REEL_RE = re.compile(r"https?://(?:www\.)?instagram\.com/(reel|reels|p|tv)/([A-Za-z0-9_-]+)", re.IGNORECASE)
_MAX_ITEMS = 250


def _browser_cookie_spec(value: str):
    spec = str(value or "").strip()
    if not spec:
        return None
    browser, sep, profile = spec.partition(":")
    browser = browser.strip()
    profile = profile.strip() if sep else None
    return (browser, profile or None, None, None) if browser else None


def _cookie_header_from_file(path: Path) -> str:
    if not path.is_file():
        return ""
    pairs = []
    try:
        for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            fields = line.split("\t")
            if len(fields) >= 7 and fields[5]:
                pairs.append(f"{fields[5]}={fields[6]}")
    except OSError:
        return ""
    return "; ".join(pairs)


def _explicit_cookie_file() -> Path | None:
    configured = os.environ.get("EVEOS_INSTAGRAM_COOKIES", "").strip()
    if configured:
        p = Path(configured).expanduser()
        if p.is_file():
            return p
    local_appdata = (os.environ.get("LOCALAPPDATA") or "").strip()
    local_file = (Path(local_appdata) / "EveOS" if local_appdata else Path.home() / ".eveos") / "instagram-cookies.txt"
    return local_file if local_file.is_file() else None


def _ydl_options() -> dict:
    options = {"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True, "source_address": "0.0.0.0"}
    cookie_file = _explicit_cookie_file()
    if cookie_file:
        options["cookiefile"] = str(cookie_file)
    else:
        browser_spec = _browser_cookie_spec(os.environ.get("EVEOS_INSTAGRAM_COOKIES_BROWSER", ""))
        if browser_spec:
            options["cookiesfrombrowser"] = browser_spec
    return options


def _clean_embedded_url(value: str) -> str:
    value = html.unescape(str(value or "")).replace("\\u0026", "&").replace("\\/", "/")
    return value.strip().strip('"').strip("'")


def _is_video_url(url: str) -> bool:
    lowered = str(url or "").lower()
    return lowered.startswith(("http://", "https://")) and (".mp4" in lowered or "/video/" in lowered or "video_url" in lowered or "playable_url" in lowered)


def _webpage_video_fallback(url: str) -> dict:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.instagram.com/",
    }
    cookie_file = _explicit_cookie_file()
    if cookie_file:
        cookie_header = _cookie_header_from_file(cookie_file)
        if cookie_header:
            headers["Cookie"] = cookie_header
    request = Request(url, headers=headers)
    with urlopen(request, timeout=12) as response:
        page = response.read().decode("utf-8", errors="replace")
    candidates = []
    patterns = [
        r'<meta[^>]+property=["\']og:video(?::secure_url)?["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:video(?::secure_url)?["\']',
        r'<meta[^>]+name=["\']twitter:player:stream["\'][^>]+content=["\']([^"\']+)["\']',
        r'"(?:video_url|playable_url_quality_hd|playable_url)"\s*:\s*"([^"]+)"',
    ]
    for pattern in patterns:
        candidates.extend(re.findall(pattern, page, flags=re.IGNORECASE))
    for candidate in candidates:
        candidate = _clean_embedded_url(candidate)
        if _is_video_url(candidate):
            title = "Instagram Video"
            title_match = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)', page, re.IGNORECASE)
            if title_match:
                title = html.unescape(title_match.group(1)).strip() or title
            thumbnail = ""
            image_match = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', page, re.IGNORECASE)
            if image_match:
                thumbnail = html.unescape(image_match.group(1)).strip()
            return {"ok": True, "videoUrl": urljoin(url, candidate), "title": title, "thumbnail": thumbnail, "source": "instagram-webpage"}
    return {"ok": False, "reason": "Instagram page metadata did not expose a playable video URL."}


def parse_urls(value) -> list[str]:
    seen = set(); urls = []
    for kind, code in _REEL_RE.findall(str(value or "")):
        normalized_kind = "reel" if kind.lower() == "reels" else kind.lower()
        canonical = f"https://www.instagram.com/{normalized_kind}/{code}/"
        if canonical not in seen:
            seen.add(canonical); urls.append(canonical)
        if len(urls) >= _MAX_ITEMS:
            break
    return urls


def _code(url: str) -> str:
    match = _REEL_RE.search(url)
    return match.group(2) if match else ""


def _fallback(url: str, position: int, reason: str = "") -> dict:
    return {"sourceId": _code(url), "title": f"Instagram Video {position}", "url": url, "position": position, "sourceProvider": "instagram", "metadataWarning": reason[:240]}


def _display_title(info: dict, position: int) -> str:
    clean = " ".join(str(info.get("title") or info.get("description") or f"Instagram Video {position}").split())
    return clean[:180] or f"Instagram Video {position}"


def _extract_one(pair) -> dict:
    position, url = pair
    from server_modules import audioflix_ytdl
    yt_dlp = audioflix_ytdl._get_yt_dlp()
    if yt_dlp is None:
        return _fallback(url, position, "yt-dlp is not installed.")
    try:
        with yt_dlp.YoutubeDL(_ydl_options()) as ydl:
            info = ydl.extract_info(url, download=False) or {}
        return {"sourceId": _code(url), "title": _display_title(info, position), "artist": info.get("uploader") or info.get("channel") or "", "album": info.get("album") or info.get("series") or "", "url": url, "image": info.get("thumbnail") or "", "duration": info.get("duration") or 0, "position": position, "sourceProvider": "instagram"}
    except Exception as exc:
        return _fallback(url, position, str(exc))


def list_collection(payload: dict) -> dict:
    urls = parse_urls(payload.get("source"))
    if not urls:
        return {"ok": False, "reason": "No Instagram video URLs were found."}
    pairs = list(enumerate(urls, 1))
    with ThreadPoolExecutor(max_workers=min(4, len(pairs))) as pool:
        entries = list(pool.map(_extract_one, pairs))
    title = str(payload.get("title") or "Instagram Videos").strip() or "Instagram Videos"
    return {"ok": True, "title": title, "playlistId": "instagram:" + ",".join(_code(url) for url in urls), "entries": entries, "scrapeSource": "yt-dlp"}


def resolve_video(payload: dict) -> dict:
    urls = parse_urls(payload.get("url"))
    if not urls:
        return {"ok": False, "reason": "No Instagram video URL was provided."}
    target_url = urls[0]
    from server_modules import audioflix_ytdl
    yt_dlp = audioflix_ytdl._get_yt_dlp()
    if yt_dlp is None:
        return {"ok": False, "reason": "yt-dlp is not installed."}
    options = {**_ydl_options(), "format": "best[ext=mp4]/best"}
    extraction_error = ""
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(target_url, download=False) or {}
        candidates = [info, *(info.get("requested_downloads") or []), *(info.get("formats") or [])]
        playable = [item for item in candidates if item.get("url") and item.get("vcodec", "none") != "none" and item.get("acodec", "none") != "none" and str(item.get("protocol") or "https").startswith(("http", "m3u8"))]
        playable.sort(key=lambda item: (item.get("ext") == "mp4", item.get("height") or 0, item.get("tbr") or 0), reverse=True)
        selected = playable[0] if playable else {}
        if selected.get("url"):
            return {"ok": True, "videoUrl": selected["url"], "title": info.get("title") or "Instagram Video", "duration": info.get("duration") or 0, "width": selected.get("width") or info.get("width") or 0, "height": selected.get("height") or info.get("height") or 0, "thumbnail": info.get("thumbnail") or "", "source": "yt-dlp"}
        extraction_error = "Instagram did not expose a progressive video stream with audio."
    except Exception as exc:
        extraction_error = str(exc)[:300]

    # Public no-login extraction: GraphQL/ruling session, then embed/page strategies.
    try:
        from server_modules import audioflix_instagram_public
        public_result = audioflix_instagram_public.resolve_public(_code(target_url))
        if public_result.get("ok"):
            return public_result
    except Exception:
        pass

    # Browser rendering remains a fallback for pages that need client hydration.
    try:
        from server_modules import audioflix_instagram_browser
        camofox_result = audioflix_instagram_browser.extract_camofox_video(target_url)
        if camofox_result.get("ok"):
            return {"ok": True, "videoUrl": camofox_result["videoUrl"], "title": camofox_result.get("title") or "Instagram Video", "duration": 0, "width": 0, "height": 0, "thumbnail": camofox_result.get("thumbnail") or "", "source": camofox_result.get("source", "camofox-browser")}
        lightpanda_result = audioflix_instagram_browser.extract_lightpanda_video(target_url)
        if lightpanda_result.get("ok"):
            return {"ok": True, "videoUrl": lightpanda_result["videoUrl"], "title": lightpanda_result.get("title") or "Instagram Video", "duration": 0, "width": 0, "height": 0, "thumbnail": lightpanda_result.get("thumbnail") or "", "source": lightpanda_result.get("source", "lightpanda-browser")}
    except Exception:
        pass

    fallback = _webpage_video_fallback(target_url)
    if fallback.get("ok"):
        return {"ok": True, "videoUrl": fallback["videoUrl"], "title": fallback.get("title") or "Instagram Video", "duration": 0, "width": 0, "height": 0, "thumbnail": fallback.get("thumbnail") or "", "source": fallback.get("source", "instagram-webpage")}

    return {"ok": False, "reason": (extraction_error or fallback.get("reason") or "Instagram video extraction failed.")[:300]}
