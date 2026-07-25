"""Localization for the Audioflix music library: turn an online (yt-dlp resolvable) track into a
local audio file on disk, and scan a folder of localized files back in.

Design notes:
- ONE track per HTTP request (`localize_one`). A batch of downloads would blow past any request
  timeout and pin a server thread; the client loops the scope and shows N/total progress instead.
- mp3 is preferred (needs ffmpeg). If ffmpeg is missing, the FFmpegExtractAudio postprocessor
  fails, so we retry without it and keep the best audio container (m4a/webm/opus). The response
  reports the actual extension so the client never assumes ".mp3".
- The output folder is a plain server-side path the user typed (same trust model as path Ports):
  localhost-only, guarded by _can_control upstream. We create it if missing but never delete.
- `scan_dir` lists audio files so a "music port" can re-attach localized files to existing tracks
  by title after a restore (the reimport-merge path).
"""

from __future__ import annotations

import logging
import re
import threading
from pathlib import Path

logger = logging.getLogger("EveOSAudioflixLocalize")

_AUDIO_EXTS = {".mp3", ".m4a", ".webm", ".opus", ".ogg", ".wav", ".flac", ".aac"}
_dl_lock = threading.Lock()  # serialize downloads: yt-dlp + ffmpeg are heavy, one at a time is fine

# Reuse the resolver module's lazy yt-dlp loader so we don't double-import.
def _get_yt_dlp():
    from server_modules import audioflix_ytdl
    return audioflix_ytdl._get_yt_dlp()


def _is_http(url: str) -> bool:
    return isinstance(url, str) and bool(re.match(r"^https?://", url.strip(), re.IGNORECASE))


def _register_servable(folder) -> None:
    """Authorize the port file server to stream files out of this folder, so a track's localized
    copy can play through /api/audioflix/port/file the moment it's downloaded or scanned. Same
    allow-list the soundboard path ports use (only audio files inside a registered dir are served)."""
    try:
        from server_modules import audioflix_bridge_ports as ports
        ports.authorize_dir(str(folder))   # persisted, so it still plays after a server restart
    except Exception:  # noqa: BLE001
        pass


def safe_filename(name: str, fallback: str = "track") -> str:
    """A Windows/macOS/Linux-safe base filename (no extension)."""
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", str(name or "")).strip().rstrip(". ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return (cleaned or fallback)[:120]


def _prepare_dir(target_dir: str):
    if not target_dir:
        return None, {"ok": False, "message": "No target folder was provided."}
    path = Path(target_dir).expanduser()
    try:
        path.mkdir(parents=True, exist_ok=True)
    except Exception as exc:  # noqa: BLE001
        return None, {"ok": False, "message": f"Cannot use folder '{target_dir}': {exc}"}
    if not path.is_dir():
        return None, {"ok": False, "message": f"'{target_dir}' is not a folder."}
    _register_servable(path)
    return path, None


def _download(yt_dlp, url: str, outtmpl: str, want_mp3: bool) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "outtmpl": outtmpl,
        "format": "bestaudio/best",
        "overwrites": True,
    }
    if want_mp3:
        opts["postprocessors"] = [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}]
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        req = (info or {}).get("requested_downloads") or []
        filepath = req[0].get("filepath") if req else None
        if not filepath:
            # Older yt-dlp: reconstruct from the template + final ext.
            filepath = ydl.prepare_filename(info)
            if want_mp3:
                filepath = str(Path(filepath).with_suffix(".mp3"))
        return {"filepath": filepath, "title": (info or {}).get("title") or "", "duration": (info or {}).get("duration") or 0}


def localize_one(payload: dict) -> dict:
    """Download a single track to the target folder. Input: {track:{id,title,url}, targetDir}."""
    track = payload.get("track") or {}
    target_dir = str(payload.get("targetDir") or "").strip()
    tid = track.get("id")
    url = str(track.get("url") or "").strip()
    title = track.get("title") or "track"

    if not _is_http(url):
        return {"ok": False, "id": tid, "error": "Track has no online URL to localize."}

    path, err = _prepare_dir(target_dir)
    if err:
        return {**err, "id": tid}

    yt_dlp = _get_yt_dlp()
    if yt_dlp is None:
        return {"ok": False, "id": tid, "error": "yt-dlp is not installed on this system."}

    base = safe_filename(title)
    outtmpl = str(path / (base + ".%(ext)s"))

    with _dl_lock:
        # Prefer mp3; if ffmpeg is missing the postprocessor raises, so fall back to the raw best
        # audio container rather than failing the whole localization.
        for want_mp3 in (True, False):
            try:
                res = _download(yt_dlp, url, outtmpl, want_mp3)
                fp = res.get("filepath")
                if fp and Path(fp).exists():
                    ext = Path(fp).suffix.lstrip(".").lower()
                    logger.info("Localized %s -> %s", url[:70], fp)
                    return {"ok": True, "id": tid, "filePath": str(fp), "ext": ext,
                            "mp3": ext == "mp3", "duration": res.get("duration") or 0}
            except Exception as exc:  # noqa: BLE001
                last = str(exc)[:300]
                if want_mp3 and ("ffmpeg" in last.lower() or "postprocess" in last.lower()):
                    continue  # retry without mp3 conversion
                logger.warning("Localize failed for %s: %s", url[:70], last)
                return {"ok": False, "id": tid, "error": last}
    return {"ok": False, "id": tid, "error": "Download produced no file."}


def link_into(payload: dict) -> dict:
    """Create a real on-disk link to an existing track inside another folder (a group's path).

    This is what makes a 3rd-class "shortcut" localization visible in the file system instead of
    existing only inside EveOS. Strategy, best first:
      * hard link  - appears as an ordinary file, plays natively, costs no extra disk space, and on
                     Windows/NTFS needs no admin rights. Same volume only.
      * symlink    - cross-volume capable, but on Windows needs Developer Mode or admin.
    A copy is deliberately NOT used as a fallback: duplicating the bytes is what the shortcut class
    exists to avoid, so the caller is told link creation failed and keeps the logical reference.
    Input: {source, targetDir, name?}. Output: {ok, path, method} or {ok: False, error}.
    """
    source = str(payload.get("source") or "").strip()
    target_dir = str(payload.get("targetDir") or "").strip()
    if not source or not os.path.isfile(source):
        return {"ok": False, "error": "Source file not found."}
    path, err = _prepare_dir(target_dir)
    if err:
        return {"ok": False, "error": err.get("message") or "Bad target folder."}

    src = Path(source)
    name = safe_filename(payload.get("name") or src.stem, src.stem) + src.suffix
    dest = path / name
    if dest.exists():
        try:
            same = os.path.samefile(str(dest), source)
        except OSError:
            same = False
        # Already linked/present -> idempotent success (re-running a group localize must not fail).
        return {"ok": True, "path": str(dest), "method": "existing" if same else "existing-file"}

    for method, make in (("hardlink", os.link), ("symlink", os.symlink)):
        try:
            make(source, str(dest))
            logger.info("Linked (%s) %s -> %s", method, source, dest)
            return {"ok": True, "path": str(dest), "method": method}
        except (OSError, NotImplementedError, AttributeError) as exc:
            last = str(exc)
    return {"ok": False, "error": f"Could not link into that folder ({last}). "
                                 "Hard links need the same drive; symlinks need Developer Mode on Windows."}


def scan_dir(payload: dict) -> dict:
    """List audio files in a folder so a music port can re-attach them by title. Input: {dir}."""
    target_dir = str(payload.get("dir") or payload.get("targetDir") or "").strip()
    if not target_dir:
        return {"ok": False, "message": "No folder was provided."}
    path = Path(target_dir).expanduser()
    if not path.is_dir():
        return {"ok": False, "message": f"'{target_dir}' is not a folder."}
    _register_servable(path)  # so localized files here become playable via /port/file
    files = []
    try:
        for entry in sorted(path.rglob("*")):
            if entry.is_file() and entry.suffix.lower() in _AUDIO_EXTS:
                # Register the subdirectory too so /port/file can serve it
                if entry.parent != path:
                    _register_servable(entry.parent)
                files.append({"name": entry.stem, "fileName": entry.name,
                              "path": str(entry), "ext": entry.suffix.lstrip(".").lower()})
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": f"Cannot read folder: {exc}"}
    return {"ok": True, "dir": str(path), "files": files, "count": len(files)}
