"""Browser-rendered video extraction for Instagram posts and Reels."""

from __future__ import annotations

import html
import json
import logging
import os
import re
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

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


def _explicit_instagram_cookie_file() -> Path | None:
    configured = os.environ.get("EVEOS_INSTAGRAM_COOKIES", "").strip()
    if configured:
        candidate = Path(configured).expanduser()
        if candidate.is_file():
            return candidate
    local_appdata = (os.environ.get("LOCALAPPDATA") or "").strip()
    local_root = Path(local_appdata) / "EveOS" if local_appdata else Path.home() / ".eveos"
    local_file = local_root / "instagram-cookies.txt"
    if local_file.is_file():
        return local_file
    fallback = Path(__file__).resolve().parents[1] / "data" / "runtime" / "instagram-cookies.txt"
    return fallback if fallback.is_file() else None


def _instagram_cookie_entries(target_url: str) -> list[dict]:
    cookie_file = _explicit_instagram_cookie_file()
    if not cookie_file:
        return []
    hostname = (urllib.parse.urlparse(target_url).hostname or "instagram.com").strip()
    entries: list[dict] = []
    try:
        for raw in cookie_file.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            fields = line.split("\t")
            if len(fields) < 7:
                continue
            domain, _include_subdomains, path, secure, expires, name, value = fields[:7]
            if not name:
                continue
            normalized_domain = domain.strip() or hostname
            if not normalized_domain.startswith(".") and normalized_domain != hostname and not hostname.endswith("." + normalized_domain):
                continue
            try:
                expiry = int(float(expires)) if expires else None
            except (TypeError, ValueError):
                expiry = None
            entry = {
                "name": name,
                "value": value,
                "domain": normalized_domain,
                "path": path or "/",
                "secure": str(secure).strip() == "TRUE",
                "httpOnly": False,
            }
            if expiry and expiry > 0:
                entry["expires"] = expiry
            entries.append(entry)
    except OSError:
        logger.warning("Instagram: unable to read explicit cookie file %s", cookie_file)
    return entries


def _request_json(method: str, port: int, path: str, payload: dict | None = None, timeout: int = 20) -> dict:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        f"http://127.0.0.1:{int(port)}{path}",
        data=data,
        method=method.upper(),
        headers=headers,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
        return json.loads(raw or "{}") if raw else {}


def _browser_target() -> tuple[int, str, bool]:
    try:
        from server_modules import audioflix_instagram_browser_auth
        if audioflix_instagram_browser_auth.browser_session_ready():
            return (
                audioflix_instagram_browser_auth.auth_port(),
                audioflix_instagram_browser_auth.auth_user_id(),
                True,
            )
    except Exception:
        pass
    return 9377, f"eveos-ig-{uuid.uuid4().hex[:10]}", False


def _browser_cookie_payload(target_url: str, user_id: str) -> tuple[list[dict], bool]:
    from server_modules.camofox_runtime import _cookies_for_target
    configured = _cookies_for_target(target_url)
    if configured:
        return configured, True
    imported = _instagram_cookie_entries(target_url)
    if imported:
        logger.info("Instagram: importing %d explicit cookie-file entries into Camofox session %s", len(imported), user_id)
        return imported, True
    return [], False


def extract_camofox_video(target_url: str, timeout: int = 18) -> dict:
    """Extract a direct video URL from the persistent/local EveOS browser session when connected."""
    try:
        from server_modules.camofox_server import _cleanup_session, _json_request, ensure_camofox_server
    except ImportError as err:
        return {"ok": False, "reason": f"Camofox modules not available: {err}"}

    port, user_id, authenticated_browser = _browser_target()
    try:
        if authenticated_browser:
            # The dedicated Instagram browser server is already running in desktop mode.
            pass
        else:
            ensure_camofox_server()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "reason": f"Camofox server unavailable: {exc}"}

    tab_id = None
    cookies_used = authenticated_browser

    def request(method: str, path: str, payload: dict | None = None, timeout_value: int = 20) -> dict:
        if authenticated_browser:
            return _request_json(method, port, path, payload=payload, timeout=timeout_value)
        return _json_request(method, path, payload=payload, timeout=timeout_value)

    try:
        if authenticated_browser:
            tab = None
            try:
                tabs = request("GET", f"/tabs?userId={urllib.parse.quote(user_id, safe='')}", timeout_value=10).get("tabs", [])
                if isinstance(tabs, list):
                    for candidate in tabs:
                        if candidate.get("tabId"):
                            tab = candidate
                            break
            except Exception:
                tab = None
            if tab:
                tab_id = str(tab.get("tabId"))
            else:
                created = request(
                    "POST",
                    "/tabs",
                    {"userId": user_id, "sessionKey": "instagram-account", "url": "https://www.instagram.com/"},
                    timeout_value=15,
                )
                tab_id = str(created.get("tabId") or "").strip()
        else:
            created = request(
                "POST",
                "/tabs",
                {"userId": user_id, "sessionKey": "audioflix-instagram"},
                timeout_value=12,
            )
            tab_id = str(created.get("tabId") or "").strip()

        if not tab_id:
            return {"ok": False, "reason": "Camofox tab creation failed."}

        if not authenticated_browser:
            cookies, cookies_used = _browser_cookie_payload(target_url, user_id)
            if cookies:
                encoded_user = urllib.parse.quote(user_id, safe="")
                request("POST", f"/sessions/{encoded_user}/cookies", {"cookies": cookies}, timeout_value=12)

        request("POST", f"/tabs/{tab_id}/navigate", {"userId": user_id, "url": target_url}, timeout_value=timeout)
        request(
            "POST",
            f"/tabs/{tab_id}/wait",
            {"userId": user_id, "timeout": min(10000, timeout * 1000), "waitForNetwork": True},
            timeout_value=timeout + 5,
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
            add(v.currentSrc); add(v.src);
            v.querySelectorAll('source').forEach(s => add(s.src));
          });
          add(document.querySelector('meta[property="og:video"]')?.content);
          add(document.querySelector('meta[property="og:video:secure_url"]')?.content);
          add(document.querySelector('meta[name="twitter:player:stream"]')?.content);
          document.querySelectorAll('script').forEach(s => {
            const txt = s.textContent || '';
            const matches = txt.match(/"(?:video_url|playable_url_quality_hd|playable_url)"\s*:\s*"([^"]+)"/g);
            if (matches) matches.forEach(m => {
              const marker = ':"'; const index = m.indexOf(marker);
              if (index >= 0) add(m.slice(index + marker.length, -1).replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
            });
          });
          return {
            title: document.title || document.querySelector('meta[property="og:title"]')?.content || 'Instagram Video',
            thumbnail: document.querySelector('meta[property="og:image"]')?.content || document.querySelector('video')?.poster || '',
            videoUrls: urls
          };
        })()"""
        data = (request(
            "POST",
            f"/tabs/{tab_id}/evaluate",
            {"userId": user_id, "expression": expression},
            timeout_value=12,
        ).get("result") or {})

        for candidate in data.get("videoUrls") or []:
            candidate = _clean_url(candidate)
            if _is_video_url(candidate):
                return {
                    "ok": True,
                    "videoUrl": candidate,
                    "title": data.get("title") or "Instagram Video",
                    "thumbnail": data.get("thumbnail") or "",
                    "source": "camofox-browser",
                    "usedCookies": cookies_used,
                }

        reason = "Camofox rendered DOM did not expose a playable video URL."
        if not cookies_used:
            reason += " No connected EveOS Instagram browser session or explicit cookies were available."
        return {"ok": False, "reason": reason, "usedCookies": cookies_used}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "reason": f"Camofox extraction error: {exc}", "usedCookies": cookies_used}
    finally:
        if tab_id and not authenticated_browser:
            try:
                _cleanup_session(user_id)
            except Exception:
                pass


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
                return {"ok": True, "videoUrl": candidate, "title": title, "thumbnail": thumbnail, "source": "lightpanda-browser"}
        return {"ok": False, "reason": "Lightpanda rendered DOM did not expose a playable video URL."}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "reason": f"Lightpanda extraction error: {exc}"}


def render_instagram_html(target_url: str, timeout: int = 5) -> str:
    """Render an Instagram URL/embed using EveOS browser infrastructure (Lightpanda / Camofox)."""
    try:
        from server_modules.lightpanda_runtime import fetch_lightpanda_html, is_lightpanda_available
        if is_lightpanda_available():
            result = fetch_lightpanda_html(target_url, timeout=timeout, http_timeout_ms=min(5000, timeout * 1000))
            if result and result.stdout and len(result.stdout) > 200:
                return str(result.stdout)
    except Exception:
        pass

    try:
        from server_modules.camofox_server import _cleanup_session, _json_request, ensure_camofox_server
        port, user_id, authenticated_browser = _browser_target()
        if not authenticated_browser:
            ensure_camofox_server()

        def request(method: str, path: str, payload: dict | None = None, timeout_val: int = 20) -> dict:
            if authenticated_browser:
                return _request_json(method, port, path, payload=payload, timeout=timeout_val)
            return _json_request(method, path, payload=payload, timeout=timeout_val)

        created = request("POST", "/tabs", {"userId": user_id, "sessionKey": "audioflix-metadata"}, timeout_val=10)
        tab_id = str(created.get("tabId") or "").strip()
        if tab_id:
            try:
                request("POST", f"/tabs/{tab_id}/navigate", {"userId": user_id, "url": target_url}, timeout_val=timeout)
                request("POST", f"/tabs/{tab_id}/wait", {"userId": user_id, "timeout": min(6000, timeout * 1000), "waitForNetwork": True}, timeout_val=timeout + 3)
                eval_res = request("POST", f"/tabs/{tab_id}/evaluate", {"userId": user_id, "expression": "document.documentElement.outerHTML"}, timeout_val=10)
                html_res = str(eval_res.get("result") or "")
                if html_res:
                    return html_res
            finally:
                if not authenticated_browser:
                    _cleanup_session(user_id)
    except Exception:
        pass

    return ""

