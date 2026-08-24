"""Browser-rendered video extraction for Instagram posts and Reels.

Used by Audioflix when yt-dlp returns an empty media response for public or
JavaScript-hydrated Instagram URLs.
"""

from __future__ import annotations

import html
import json
import logging
import re
import urllib.parse
import uuid

logger = logging.getLogger("AudioflixInstagramBrowser")


def _clean_url(value: str) -> str:
    if not value or not isinstance(value, str):
        return ""
    value = html.unescape(value).replace("\\u0026", "&").replace("\\/", "/")
    try:
        value = json.loads(f'"{value.replace(chr(34), chr(92) + chr(34))}"')
    except Exception:
        pass
    return value.strip().strip('"').strip("'")


def _is_video_url(url: str) -> bool:
    lowered = str(url or "").lower()
    return lowered.startswith(("http://", "https://")) and (
        ".mp4" in lowered
        or ".m3u8" in lowered
        or "/video/" in lowered
        or "video_url" in lowered
        or "playable_url" in lowered
        or "bytestart" in lowered
    )


def extract_camofox_video(target_url: str, timeout: int = 18) -> dict:
    """Extract a direct video URL from an Instagram post via Camofox browser runtime."""
    try:
        from server_modules.camofox_runtime import _cookies_for_target
        from server_modules.camofox_server import _cleanup_session, _json_request, ensure_camofox_server
    except ImportError as err:
        return {"ok": False, "reason": f"Camofox modules not available: {err}"}

    try:
        ensure_camofox_server()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "reason": f"Camofox server unavailable: {exc}"}

    user_id = f"eveos-ig-{uuid.uuid4().hex[:10]}"
    tab_id = None
    cookies = _cookies_for_target(target_url)

    try:
        created = _json_request(
            "POST",
            "/tabs",
            payload={"userId": user_id, "sessionKey": "audioflix-instagram"},
            timeout=12,
        )
        tab_id = str(created.get("tabId") or "").strip()
        if not tab_id:
            return {"ok": False, "reason": "Camofox tab creation failed."}

        if cookies:
            encoded_user = urllib.parse.quote(user_id, safe="")
            _json_request(
                "POST",
                f"/sessions/{encoded_user}/cookies",
                payload={"cookies": cookies},
                timeout=12,
            )

        _json_request(
            "POST",
            f"/tabs/{tab_id}/navigate",
            payload={"userId": user_id, "url": target_url},
            timeout=timeout,
        )
        _json_request(
            "POST",
            f"/tabs/{tab_id}/wait",
            payload={"userId": user_id, "timeout": min(10000, timeout * 1000), "waitForNetwork": True},
            timeout=timeout + 5,
        )

        expression = r"""(() => {
          const seen = new Set();
          const urls = [];
          const add = (u) => {
            if (!u || typeof u !== 'string') return;
            u = u.trim();
            if ((u.startsWith('http://') || u.startsWith('https://')) && !u.startsWith('blob:') && !seen.has(u)) {
              seen.add(u);
              urls.push(u);
            }
          };
          document.querySelectorAll('video').forEach(v => {
            add(v.currentSrc);
            add(v.src);
            v.querySelectorAll('source').forEach(s => add(s.src));
          });
          add(document.querySelector('meta[property="og:video"]')?.content);
          add(document.querySelector('meta[property="og:video:secure_url"]')?.content);
          add(document.querySelector('meta[name="twitter:player:stream"]')?.content);
          document.querySelectorAll('script').forEach(s => {
            const txt = s.textContent || '';
            const matches = txt.match(/"(?:video_url|playable_url_quality_hd|playable_url)"\s*:\s*"([^"]+)"/g);
            if (matches) {
              matches.forEach(m => {
                const parts = m.split(':"');
                if (parts[1]) {
                  const cleaned = parts[1].slice(0, -1).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                  add(cleaned);
                }
              });
            }
          });
          return {
            title: document.title || document.querySelector('meta[property="og:title"]')?.content || 'Instagram Video',
            thumbnail: document.querySelector('meta[property="og:image"]')?.content || document.querySelector('video')?.poster || '',
            videoUrls: urls
          };
        })()"""

        eval_resp = _json_request(
            "POST",
            f"/tabs/{tab_id}/evaluate",
            payload={"userId": user_id, "expression": expression},
            timeout=12,
        )
        data = eval_resp.get("result") or {}
        raw_urls = data.get("videoUrls") or []
        for candidate in raw_urls:
            candidate = _clean_url(candidate)
            if _is_video_url(candidate):
                return {
                    "ok": True,
                    "videoUrl": candidate,
                    "title": data.get("title") or "Instagram Video",
                    "thumbnail": data.get("thumbnail") or "",
                    "source": "camofox-browser",
                }
        return {"ok": False, "reason": "Camofox rendered DOM did not expose a playable video URL."}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "reason": f"Camofox extraction error: {exc}"}
    finally:
        _cleanup_session(user_id)


def extract_lightpanda_video(target_url: str, timeout: int = 18) -> dict:
    """Extract a direct video URL from an Instagram post via Lightpanda browser rendering."""
    try:
        from server_modules.lightpanda_runtime import fetch_lightpanda_html, is_lightpanda_available
    except ImportError as err:
        return {"ok": False, "reason": f"Lightpanda modules not available: {err}"}

    if not is_lightpanda_available():
        return {"ok": False, "reason": "Lightpanda binary not available."}

    try:
        result = fetch_lightpanda_html(target_url, timeout=timeout)
        page = result.stdout or ""
        if not page:
            return {"ok": False, "reason": "Lightpanda returned empty page output."}

        candidates: list[str] = []
        patterns = [
            r'<video[^>]+src=["\']([^"\']+)["\']',
            r'<source[^>]+src=["\']([^"\']+)["\']',
            r'<meta[^>]+property=["\']og:video(?::secure_url)?["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:video(?::secure_url)?["\']',
            r'<meta[^>]+name=["\']twitter:player:stream["\'][^>]+content=["\']([^"\']+)["\']',
            r'"(?:video_url|playable_url_quality_hd|playable_url)"\s*:\s*"([^"]+)"',
        ]
        for pattern in patterns:
            candidates.extend(re.findall(pattern, page, flags=re.IGNORECASE))

        for candidate in candidates:
            candidate = _clean_url(candidate)
            if _is_video_url(candidate):
                title_match = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', page)
                title = html.unescape(title_match.group(1)).strip() if title_match else "Instagram Video"
                thumb_match = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', page)
                thumbnail = html.unescape(thumb_match.group(1)).strip() if thumb_match else ""
                return {
                    "ok": True,
                    "videoUrl": candidate,
                    "title": title,
                    "thumbnail": thumbnail,
                    "source": "lightpanda-browser",
                }
        return {"ok": False, "reason": "Lightpanda rendered DOM did not expose a playable video URL."}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "reason": f"Lightpanda extraction error: {exc}"}
