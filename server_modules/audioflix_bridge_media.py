"""Small native playback helpers for Audioflix.

The browser can only route audio it owns or permitted sinks it can see. These
helpers let the EveOS HTTP server play local/served Audioflix clips directly to
the selected Windows endpoint without moving the whole browser in the mixer.
"""

from __future__ import annotations

import math
import re
import wave
from pathlib import Path
from urllib.parse import unquote, urlparse


LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1", "::ffff:127.0.0.1"}


def _mono_wav_samples(path: Path, np_module):
    with wave.open(str(path), "rb") as wav:
        channels = max(1, int(wav.getnchannels() or 1))
        sample_width = int(wav.getsampwidth() or 0)
        sample_rate = int(wav.getframerate() or 24000)
        raw = wav.readframes(wav.getnframes())
    if sample_width == 1:
        samples = (np_module.frombuffer(raw, dtype="u1").astype("float32") - 128.0) / 128.0
    elif sample_width == 2:
        samples = np_module.frombuffer(raw, dtype="<i2").astype("float32") / 32768.0
    elif sample_width == 4:
        samples = np_module.frombuffer(raw, dtype="<i4").astype("float32") / 2147483648.0
    else:
        raise RuntimeError("Native media route currently supports 8/16/32-bit WAV files.")
    if channels > 1:
        samples = samples.reshape((-1, channels)).mean(axis=1)
    return sample_rate, samples


def _resolve_media_path(value: str, project_root: Path) -> Path:
    raw = str(value or "").strip()
    if not raw:
        raise RuntimeError("Missing Audioflix media URL/path.")
    parsed = urlparse(raw)
    if parsed.scheme in {"http", "https"}:
        if parsed.hostname not in LOOPBACK_HOSTS:
            raise RuntimeError("Native media route supports local/served audio. Remote URLs use browser playback.")
        candidate = project_root / unquote(parsed.path.lstrip("/"))
    elif parsed.scheme == "file":
        path = unquote(parsed.path or "")
        if re.match(r"^/[a-zA-Z]:", path):
            path = path[1:]
        candidate = Path(path)
    elif parsed.scheme:
        raise RuntimeError(f"Unsupported native media URL scheme: {parsed.scheme}.")
    else:
        candidate = Path(raw)
        if not candidate.is_absolute():
            candidate = project_root / raw.lstrip("/\\")
    candidate = candidate.expanduser().resolve()
    if not candidate.is_file():
        raise RuntimeError(f"Native media file not found: {candidate}")
    return candidate


def play_tone(payload: dict, np_module, enqueue) -> dict:
    sample_rate = max(8000, min(96000, int(payload.get("sampleRate") or 24000)))
    seconds = max(0.05, min(5.0, float(payload.get("seconds") or 0.55)))
    frequency = max(80.0, min(6000.0, float(payload.get("frequency") or 660.0)))
    count = max(1, int(sample_rate * seconds))
    t = np_module.arange(count, dtype="float32") / float(sample_rate)
    samples = np_module.sin(2 * math.pi * frequency * t).astype("float32") * 0.24
    fade_len = min(count // 2, max(1, int(sample_rate * 0.03)))
    fade = np_module.ones(count, dtype="float32")
    ramp = np_module.linspace(0.0, 1.0, fade_len, dtype="float32")
    fade[:fade_len] = ramp
    fade[-fade_len:] = ramp[::-1]
    return enqueue(str(payload.get("deviceId") or ""), sample_rate, samples * fade, "tone")


def play_media(payload: dict, np_module, enqueue, project_root: Path) -> dict:
    path = _resolve_media_path(str(payload.get("url") or payload.get("path") or ""), project_root)
    if path.suffix.lower() != ".wav":
        raise RuntimeError("Native Audioflix clips support WAV today; this item will use browser playback.")
    sample_rate, samples = _mono_wav_samples(path, np_module)
    result = enqueue(str(payload.get("deviceId") or ""), sample_rate, samples, "media", str(payload.get("itemId") or payload.get("url") or path))
    result["path"] = str(path)
    result["title"] = str(payload.get("title") or path.name)
    return result
