"""Resolve a Spotify track link to the YouTube video that holds the same recording.

Spotify's own audio is Widevine-encrypted and is NOT obtainable; the only Spotify bytes served in
the clear are the 30-second preview. So "localize a Spotify song" means: read the track's metadata
from Spotify, find the matching recording on YouTube, and localize THAT with the existing yt-dlp
pipeline. This module is only the matching half.

No Spotify API credentials are needed. https://open.spotify.com/embed/track/<id> returns a public
page whose embedded JSON carries the fields that matter, verified against a live track:

    "name": "Never Gonna Give You Up"
    "artists": [{"name": "Rick Astley"}]
    "duration": 213573          # milliseconds, exact

Note it does NOT include the ISRC, so matching leans on title + artist + that exact duration.

Duration is the discriminator that does the real work. Searching the example above returns the
official video (213s), two remasters (212-214s) and a live performance (234s). A tolerance gate drops
the live take outright; view count is then only a tie-break BETWEEN plausible candidates, never the
primary signal — on its own it happily picks a remix or a lyric video with more plays than the
original.
"""

from __future__ import annotations

import json
import re
import urllib.request

EMBED_URL = "https://open.spotify.com/embed/track/{track_id}"
# A browser UA: the embed page varies its payload for unknown clients.
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
_TIMEOUT = 20

# Editions that are a DIFFERENT recording of the same song. Allowed only when the Spotify title says
# so too, otherwise a search for a studio track must not settle for a live or sped-up upload.
EDITION_MARKERS = (
    "live", "remix", "cover", "karaoke", "instrumental", "acoustic", "acapella", "a cappella",
    "sped up", "spedup", "slowed", "reverb", "nightcore", "8d", "bass boosted", "mashup",
    "tribute", "rehearsal", "demo", "concert", "session", "medley",
)
# Uploads that are not a single track at all.
BULK_MARKERS = ("full album", "greatest hits", "playlist", "mix ", " mix", "compilation", "hour",
                "hours", "megamix", "non stop", "nonstop", "all songs")

DEFAULT_TOLERANCE_SECONDS = 3.0
# YouTube reports whole seconds while Spotify gives milliseconds, so any delta under this is pure
# rounding noise and says nothing about which candidate is the better recording. Treat everything
# inside it as equally plausible and let view count decide — otherwise 0.15s of noise outranks a
# 156x popularity difference, which is how the official video loses to a remaster.
DURATION_NOISE_SECONDS = 1.5
DEFAULT_SEARCH_RESULTS = 8


def spotify_track_id(url: str) -> str:
    """Extract the track id from any open.spotify.com/track/... or spotify:track:... form."""
    text = str(url or "").strip()
    match = re.search(r"(?:track[/:])([A-Za-z0-9]{22})", text)
    return match.group(1) if match else ""


def _first(payload, *keys):
    """Walk nested dict/list payloads for the first occurrence of any key."""
    stack = [payload]
    while stack:
        node = stack.pop(0)
        if isinstance(node, dict):
            for key in keys:
                if key in node:
                    return node[key]
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)
    return None


def parse_embed_html(html: str) -> dict:
    """Pull name / artists / duration_ms / preview out of an embed page's JSON blobs.

    Kept separate from the fetch so it is testable against a captured fixture without network.
    """
    best = {}
    for blob in re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', html or "",
                           re.DOTALL):
        try:
            data = json.loads(blob)
        except Exception:  # noqa: BLE001
            continue
        name = _first(data, "name", "title")
        duration = _first(data, "duration", "duration_ms", "durationMs")
        artists = _first(data, "artists")
        preview = _first(data, "audioPreview")
        if isinstance(name, str) and name.strip() and not best.get("title"):
            best["title"] = name.strip()
        if isinstance(duration, (int, float)) and duration > 0 and not best.get("duration_ms"):
            best["duration_ms"] = int(duration)
        if isinstance(artists, list) and artists and not best.get("artists"):
            names = [a.get("name") for a in artists if isinstance(a, dict) and a.get("name")]
            if names:
                best["artists"] = names
        if isinstance(preview, dict) and preview.get("url") and not best.get("preview_url"):
            best["preview_url"] = preview["url"]
    return best


def fetch_track_metadata(url: str, opener=None) -> dict:
    """Public metadata for a Spotify track. No API key, no login."""
    track_id = spotify_track_id(url)
    if not track_id:
        return {"ok": False, "message": "That does not look like a Spotify track link."}
    request = urllib.request.Request(EMBED_URL.format(track_id=track_id),
                                     headers={"User-Agent": _UA})
    try:
        read = opener or (lambda req: urllib.request.urlopen(req, timeout=_TIMEOUT).read())
        html = read(request)
        if isinstance(html, bytes):
            html = html.decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": f"Could not read the Spotify track page: {exc}"}

    meta = parse_embed_html(html)
    if not meta.get("title"):
        return {"ok": False, "message": "Spotify did not return a track title for that link."}
    meta.update({"ok": True, "track_id": track_id,
                 "duration_seconds": (meta.get("duration_ms") or 0) / 1000.0})
    return meta


def _has(text: str, markers) -> bool:
    low = f" {str(text or '').lower()} "
    return any(marker in low for marker in markers)


def search_query(meta: dict) -> str:
    artist = (meta.get("artists") or [""])[0]
    return " ".join(part for part in (artist, meta.get("title")) if part).strip()


def rank_candidates(meta: dict, candidates, tolerance_seconds: float = DEFAULT_TOLERANCE_SECONDS):
    """Score YouTube results against the Spotify track. Returns (accepted, rejected).

    Order of operations matters: reject on identity first, and only then let popularity break a tie.
    Sorting by views before filtering is what picks the wrong recording.
    """
    target = float(meta.get("duration_seconds") or 0)
    wanted_edition = _has(meta.get("title"), EDITION_MARKERS)
    accepted, rejected = [], []

    for item in candidates or []:
        title = str((item or {}).get("title") or "")
        duration = (item or {}).get("duration")
        views = int((item or {}).get("view_count") or 0)
        entry = {"title": title, "duration": duration, "views": views,
                 "url": (item or {}).get("webpage_url") or (item or {}).get("url") or "",
                 "id": (item or {}).get("id") or ""}

        if not entry["title"]:
            entry["reason"] = "no title"
            rejected.append(entry)
            continue
        if not isinstance(duration, (int, float)) or duration <= 0:
            entry["reason"] = "unknown duration"
            rejected.append(entry)
            continue
        if target > 0 and abs(float(duration) - target) > tolerance_seconds:
            entry["reason"] = f"duration {duration}s vs {target:.1f}s"
            rejected.append(entry)
            continue
        if _has(title, BULK_MARKERS):
            entry["reason"] = "album/compilation upload"
            rejected.append(entry)
            continue
        # A different edition is only acceptable if that is what was asked for.
        if not wanted_edition and _has(title, EDITION_MARKERS):
            entry["reason"] = "different edition (live/remix/etc)"
            rejected.append(entry)
            continue
        entry["delta"] = round(abs(float(duration) - target), 3)
        accepted.append(entry)

    # Bucket by whether the duration difference is meaningful at all, then prefer the most-played
    # candidate inside that bucket. Popularity is the tie-break among equals, never the filter.
    accepted.sort(key=lambda e: (0 if e["delta"] <= DURATION_NOISE_SECONDS else 1, -e["views"]))
    return accepted, rejected


def find_youtube_match(url: str, searcher=None, opener=None,
                       tolerance_seconds: float = DEFAULT_TOLERANCE_SECONDS,
                       results: int = DEFAULT_SEARCH_RESULTS) -> dict:
    """Spotify link -> the best-matching YouTube video, or a reason why none qualified."""
    meta = fetch_track_metadata(url, opener=opener)
    if not meta.get("ok"):
        return meta

    query = search_query(meta)
    if not query:
        return {"ok": False, "message": "Spotify returned no title or artist to search with."}

    try:
        candidates = (searcher or _ytdlp_search)(query, results)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": f"YouTube search failed: {exc}", "query": query}

    accepted, rejected = rank_candidates(meta, candidates, tolerance_seconds)
    if not accepted:
        return {"ok": False, "query": query, "spotify": meta, "rejected": rejected,
                "message": (f"No YouTube result matched \"{query}\" within "
                            f"{tolerance_seconds:.0f}s of {meta.get('duration_seconds', 0):.0f}s.")}
    best = accepted[0]
    return {"ok": True, "query": query, "spotify": meta, "match": best,
            "alternatives": accepted[1:4], "rejected": rejected,
            "url": best["url"] or (f"https://www.youtube.com/watch?v={best['id']}" if best["id"] else "")}


def _ytdlp_search(query: str, results: int):
    """yt-dlp's own search — no YouTube API key required."""
    import yt_dlp  # imported lazily: the matcher is testable without it

    opts = {"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        found = ydl.extract_info(f"ytsearch{int(results)}:{query}", download=False)
    return (found or {}).get("entries") or []
