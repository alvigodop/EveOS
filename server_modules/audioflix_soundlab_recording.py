"""Persist a user-triggered Sonic Forge recording into an Audioflix music folder."""

from __future__ import annotations

import base64
import binascii
import os
import re
import tempfile

from server_modules.audioflix_bridge_ports import authorize_dir

_MAX_ENCODED_BYTES = 72 * 1024 * 1024
_MIME_EXTENSIONS = {
    "audio/webm": ".webm",
    "audio/webm;codecs=opus": ".webm",
    "audio/ogg": ".ogg",
    "audio/ogg;codecs=opus": ".ogg",
}


def _safe_stem(value: object) -> str:
    stem = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "-", str(value or "Sonic Forge Session"))
    stem = re.sub(r"\s+", " ", stem).strip(" .-")[:100]
    return stem or "Sonic Forge Session"


def save_recording(payload: dict) -> dict:
    encoded = str(payload.get("audio") or "").strip()
    if not encoded:
        raise ValueError("Recording payload is empty.")
    if len(encoded) > _MAX_ENCODED_BYTES:
        raise ValueError("Recording is too large to save through the local bridge.")

    directory = os.path.realpath(os.path.abspath(str(payload.get("directory") or "").strip()))
    if not directory:
        raise ValueError("Choose a local recording folder first.")
    os.makedirs(directory, exist_ok=True)
    if not os.path.isdir(directory):
        raise ValueError("Recording destination is not a folder.")

    mime = str(payload.get("mimeType") or "audio/webm").lower()
    extension = _MIME_EXTENSIONS.get(mime, ".webm")
    filename = f"{_safe_stem(payload.get('name'))}{extension}"
    target = os.path.join(directory, filename)
    counter = 2
    while os.path.exists(target):
        target = os.path.join(directory, f"{_safe_stem(payload.get('name'))} {counter}{extension}")
        counter += 1

    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Recording payload is not valid base64 audio.") from exc
    if not raw:
        raise ValueError("Recording payload decoded to an empty file.")

    handle, temporary = tempfile.mkstemp(prefix=".eveos-sonic-", suffix=extension, dir=directory)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.remove(temporary)

    authorize_dir(directory)
    return {
        "ok": True,
        "path": target,
        "fileName": os.path.basename(target),
        "mimeType": mime,
        "bytes": len(raw),
    }
