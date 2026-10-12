"""Strict typed Spotify identities; bare IDs are legacy tracks, never guessed episodes."""
from __future__ import annotations

import re
from urllib.parse import urlsplit

_ID = re.compile(r"^[A-Za-z0-9]{22}$")
_URI = re.compile(r"^spotify:(track|episode):([A-Za-z0-9]{22})$", re.I)
_PATH = re.compile(r"^/(?:intl-[a-z]{2}/)?(?:embed/)?(track|episode)/([A-Za-z0-9]{22})/?$", re.I)
_PAYLOAD_KEYS = ("spotifyUri", "uri", "sourceUri", "url", "spotifyUrl", "originalUrl",
                 "spotifyId", "trackId", "sourceMediaId", "spotifyTrackId")


def has_media_identity(payload: dict) -> bool:
    return payload.get("sourceIsLocal") is True or any(
        payload.get(key) for key in (*_PAYLOAD_KEYS, "mediaType", "sourceMediaType"))


def parse_media(value, media_type: str = "") -> dict | None:
    raw, hint = str(value or "").strip(), str(media_type or "").strip().lower()
    if hint and hint not in {"track", "episode"}:
        return None
    if _ID.fullmatch(raw):
        kind, media_id = hint or "track", raw
    else:
        match = _URI.fullmatch(raw)
        if not match:
            try:
                url = urlsplit(raw)
                if url.scheme not in {"http", "https"} or url.hostname != "open.spotify.com":
                    return None
                match = _PATH.fullmatch(url.path)
            except ValueError:
                return None
        if not match:
            return None
        kind, media_id = match.group(1).lower(), match.group(2)
        if hint and hint != kind:
            return None
    return {"spotifyId": media_id, "mediaType": kind, "spotifyUri": f"spotify:{kind}:{media_id}"}


def media_from_payload(payload: dict) -> dict | None:
    if payload.get("sourceIsLocal") is True:
        return None
    hints = [str(payload[key]).strip().lower() for key in ("mediaType", "sourceMediaType") if payload.get(key)]
    if any(hint not in {"track", "episode"} for hint in hints) or len(set(hints)) > 1:
        return None
    hint = hints[0] if hints else ""
    supplied = [(key, payload[key]) for key in _PAYLOAD_KEYS if payload.get(key)]
    if not supplied:
        return None
    identity = parse_media(supplied[0][1], hint)
    if not identity or (payload.get("spotifyTrackId") and identity["mediaType"] != "track"):
        return None
    for _key, value in supplied[1:]:
        candidate = parse_media(value, identity["mediaType"])
        if not candidate or candidate["spotifyUri"] != identity["spotifyUri"]:
            return None
    return identity
