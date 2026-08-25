from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen


_INSTAGRAM_HOSTS = {"instagram.com", "www.instagram.com"}
_DEFAULT_SERVERS = ("http://127.0.0.1:8765", "http://localhost:8765")


def is_instagram_url(url: str) -> bool:
    parsed = urlparse(str(url or "").strip())
    return parsed.scheme in {"http", "https"} and (parsed.hostname or "").lower() in _INSTAGRAM_HOSTS


def _server_candidates() -> list[str]:
    configured = str(os.environ.get("EVEOS_LOCAL_SERVER_URL", "")).strip().rstrip("/")
    candidates = [configured] if configured else []
    candidates.extend(_DEFAULT_SERVERS)
    return list(dict.fromkeys(candidate for candidate in candidates if candidate))


def resolve_instagram_video(url: str, timeout: int = 60) -> dict:
    """Ask the running EveOS Audioflix backend for a playable Instagram video URL."""
    payload = json.dumps({"url": url}).encode("utf-8")
    last_error = ""
    for base in _server_candidates():
        try:
            request = Request(
                f"{base}/api/audioflix/instagram-video",
                data=payload,
                method="POST",
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
            with urlopen(request, timeout=timeout) as response:
                body = json.loads(response.read().decode("utf-8", errors="replace") or "{}")
            if body.get("ok") and body.get("videoUrl"):
                return body
            last_error = str(body.get("reason") or "Instagram backend returned no playable video URL.")
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
    return {"ok": False, "reason": last_error or "EveOS local server was not reachable."}


def download_to_wav(video_url: str, temp: Path, ffmpeg: str | None = None) -> Path:
    ffmpeg_bin = ffmpeg or shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("FFmpeg is required to convert the Instagram video stream to WAV.")
    output = temp / "instagram-source.wav"
    command = [
        ffmpeg_bin,
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", video_url,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        "-ac", "2",
        str(output),
    ]
    completed = subprocess.run(
        command,
        cwd=temp,
        capture_output=True,
        text=True,
        timeout=900,
        check=False,
        encoding="utf-8",
        errors="replace",
    )
    if completed.returncode or not output.exists() or output.stat().st_size <= 0:
        detail = (completed.stderr or completed.stdout or "FFmpeg produced no WAV output.").strip()
        raise RuntimeError(detail[-1800:])
    return output


def resolve_and_download(url: str, temp: Path, ffmpeg: str | None = None) -> tuple[Path, dict]:
    resolved = resolve_instagram_video(url)
    if not resolved.get("ok"):
        raise RuntimeError(resolved.get("reason") or "Instagram could not be resolved through EveOS.")
    audio_path = download_to_wav(str(resolved["videoUrl"]), temp, ffmpeg=ffmpeg)
    return audio_path, resolved
