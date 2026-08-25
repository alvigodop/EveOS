"""Instagram media-only resolver used by playback and Piano.

This intentionally does not call the deferred rich-metadata resolver. It only
asks the existing media providers for a playable video URL.
"""

from __future__ import annotations


def resolve_video(payload: dict) -> dict:
    from server_modules import audioflix_instagram

    urls = audioflix_instagram.parse_urls(payload.get("url"))
    if not urls:
        return {"ok": False, "reason": "No Instagram video URL was provided."}

    target_url = urls[0]
    shortcode = audioflix_instagram._code(target_url)
    for provider in audioflix_instagram.RESOLVER_PROVIDERS:
        try:
            result = provider(target_url, shortcode)
            if result and result.get("ok") and result.get("videoUrl"):
                return result
        except Exception:
            continue

    return {"ok": False, "reason": "All Instagram media providers failed to extract a playable video stream."}
