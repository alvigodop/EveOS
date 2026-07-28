"""Spotify playlist metadata extraction for Audioflix.

This module deliberately extracts metadata only. Spotify audio is never downloaded; Audioflix
localization may attach user-owned files from a folder after import.
"""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path

_CACHE_TTL_S = 300
_cache: dict[str, dict] = {}
_cache_lock = threading.Lock()
_scrape_lock = threading.Lock()
_PLAYLIST_RE = re.compile(
    r"https?://open\.spotify\.com/(?:embed/)?playlist/([A-Za-z0-9]+)(?:[?&#][^\"'<>\s]*)?",
    re.IGNORECASE,
)


def normalize_playlist_input(value: str) -> dict:
    raw = html.unescape(str(value or "").strip())
    match = _PLAYLIST_RE.search(raw)
    if not match:
        return {"ok": False, "reason": "Enter a public Spotify playlist URL, embed URL, or iframe snippet."}
    playlist_id = match.group(1)
    return {
        "ok": True,
        "playlistId": playlist_id,
        "url": f"https://open.spotify.com/playlist/{playlist_id}",
        "embedUrl": f"https://open.spotify.com/embed/playlist/{playlist_id}",
    }


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _profile_dir() -> Path:
    configured = os.environ.get("EVEOS_SPOTIFY_PROFILE", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    local = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
    target = local / "EveOS" / "spotify-browser-profile"
    if not target.exists():
        legacy = Path.home() / "Downloads" / "drift-spotify-embed-scraper-v2" / ".spotify-browser-profile"
        if legacy.is_dir():
            target.parent.mkdir(parents=True, exist_ok=True)
            try:
                shutil.copytree(legacy, target)
            except OSError:
                pass
    target.mkdir(parents=True, exist_ok=True)
    return target


def _cache_get(key: str):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and entry["expires"] > time.monotonic():
            return {**entry["value"], "cached": True}
        if entry:
            _cache.pop(key, None)
    return None


def _cache_set(key: str, value: dict) -> None:
    with _cache_lock:
        _cache[key] = {"expires": time.monotonic() + _CACHE_TTL_S, "value": value}
        if len(_cache) > 30:
            oldest = min(_cache, key=lambda item: _cache[item]["expires"])
            _cache.pop(oldest, None)


def _helper_command(mode: str, normalized: dict) -> list[str]:
    return [
        "node",
        str(_project_root() / "server_modules" / "audioflix_spotify_scrape.js"),
        mode,
        normalized["embedUrl"],
        str(_profile_dir()),
    ]


def list_playlist(value: str, force: bool = False) -> dict:
    normalized = normalize_playlist_input(value)
    if not normalized.get("ok"):
        return normalized
    if not force:
        cached = _cache_get(normalized["playlistId"])
        if cached:
            return cached

    try:
        with _scrape_lock:
            result = subprocess.run(
                _helper_command("scrape", normalized),
                cwd=str(_project_root()),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=180,
                check=False,
            )
    except subprocess.TimeoutExpired:
        return {"ok": False, "reason": "Spotify extraction timed out. Open the saved Spotify session and try again."}
    except OSError as exc:
        return {"ok": False, "reason": f"Could not start the Spotify extractor: {exc}"}

    try:
        payload = json.loads((result.stdout or "").strip())
    except json.JSONDecodeError:
        detail = (result.stderr or result.stdout or "No extractor output.").strip()[-500:]
        return {"ok": False, "reason": f"Spotify extractor returned invalid data: {detail}"}
    if payload.get("ok"):
        payload.update(normalized)
        payload["provider"] = "spotify"
        payload["cached"] = False
        _cache_set(normalized["playlistId"], payload)
    return payload


def open_session(value: str) -> dict:
    normalized = normalize_playlist_input(value)
    if not normalized.get("ok"):
        return normalized
    command = _helper_command("login", normalized)
    flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    try:
        subprocess.Popen(
            command,
            cwd=str(_project_root()),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
            close_fds=True,
        )
    except OSError as exc:
        return {"ok": False, "reason": f"Could not open the Spotify session: {exc}"}
    return {
        "ok": True,
        "message": "Spotify session opened. Sign in, verify the playlist rows, then close that window and sync again.",
        **normalized,
    }


def session_action(payload: dict) -> dict:
    return open_session(str(payload.get("url") or payload.get("embed") or ""))
