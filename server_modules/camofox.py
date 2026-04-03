import atexit
import errno
import json
import logging
import os
import re
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import deque
from http import HTTPStatus
from types import SimpleNamespace
from urllib.parse import urlparse

logger = logging.getLogger("FandomDiscoveryServer")

DEFAULT_CAMOFOX_SERVER_PORT = 9377
DEFAULT_CAMOFOX_SERVER_START_TIMEOUT_SECONDS = 75
DEFAULT_CAMOFOX_FETCH_TIMEOUT_SECONDS = 55
BLOCKED_TITLE_TOKENS = (
    "just a moment",
    "attention required! | cloudflare",
    "access denied",
    "verify you are human",
    "checking your browser",
    "enable javascript and cookies",
    "captcha",
    "too many requests",
)

_SERVER_LOCK = threading.Lock()
_SERVER_PROCESS = None
_ACTIVE_SERVER_PORT = None
_SERVER_LOG_TAIL = deque(maxlen=80)


def _project_root():
    return (
        os.environ.get("EVEOS_PROJECT_ROOT")
        or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )


def _runtime_root():
    explicit = (os.environ.get("EVEOS_CAMOFOX_RUNTIME_ROOT") or "").strip()
    if explicit:
        return explicit
    return os.path.join(_project_root(), "tools", "camofox-runtime")


def _camofox_server_entry_path():
    explicit = (os.environ.get("EVEOS_CAMOFOX_SERVER_ENTRY") or "").strip()
    if explicit:
        return explicit
    return os.path.join(
        _runtime_root(),
        "node_modules",
        "@askjo",
        "camofox-browser",
        "server.js",
    )


def _node_binary():
    return (os.environ.get("EVEOS_CAMOFOX_NODE_BIN") or "node").strip() or "node"


def _camofox_server_port():
    raw = (os.environ.get("EVEOS_CAMOFOX_SERVER_PORT") or "").strip()
    try:
        port = int(raw)
    except Exception:
        port = DEFAULT_CAMOFOX_SERVER_PORT
    if port < 1 or port > 65535:
        return DEFAULT_CAMOFOX_SERVER_PORT
    return port


def current_camofox_server_port():
    return _ACTIVE_SERVER_PORT or _camofox_server_port()


def _candidate_camofox_server_ports():
    configured_port = _camofox_server_port()
    explicit = (os.environ.get("EVEOS_CAMOFOX_SERVER_PORT") or "").strip()
    if explicit:
        return [configured_port]

    max_candidates = 6
    return [
        configured_port + offset
        for offset in range(max_candidates)
        if 1 <= configured_port + offset <= 65535
    ]


def _append_server_log(line):
    text = str(line or "").strip()
    if not text:
        return
    _SERVER_LOG_TAIL.append(text)


def _server_log_tail_text():
    return "\n".join(_SERVER_LOG_TAIL)


def _local_runtime_root():
    explicit = (os.environ.get("EVEOS_CAMOFOX_LOCAL_RUNTIME_ROOT") or "").strip()
    if explicit:
        return explicit
    local_appdata = (os.environ.get("LOCALAPPDATA") or "").strip()
    if local_appdata:
        return os.path.join(local_appdata, "EveOS")
    return os.path.join(os.path.expanduser("~"), ".eveos")


def _candidate_cookie_config_paths():
    explicit = (os.environ.get("EVEOS_CAMOFOX_COOKIE_CONFIG") or "").strip()
    if explicit:
        return [explicit]
    root = _local_runtime_root()
    return [
        os.path.join(root, "camofox-site-cookies.json"),
        os.path.join(root, "lightpanda-site-cookies.json"),
    ]


def _load_cookie_config_with_source():
    for path in _candidate_cookie_config_paths():
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
            if isinstance(payload, dict):
                return payload, path
        except Exception:
            logger.warning("Camofox: Failed to load cookie config at %s", path)
            return {}, path
    return {}, _candidate_cookie_config_paths()[0]


def _count_non_empty_cookie_entries(raw_value):
    count = 0
    if isinstance(raw_value, dict):
        for value in raw_value.values():
            if str(value or "").strip():
                count += 1
    elif isinstance(raw_value, list):
        for item in raw_value:
            if not isinstance(item, dict):
                continue
            if str(item.get("value") or "").strip():
                count += 1
    return count


def _host_candidates(hostname):
    host = str(hostname or "").strip().lower()
    if not host:
        return []
    parts = [part for part in host.split(".") if part]
    candidates = []
    for index in range(len(parts) - 1):
        candidate = ".".join(parts[index:])
        if candidate not in candidates:
            candidates.append(candidate)
    if host not in candidates:
        candidates.insert(0, host)
    return candidates


def _normalize_cookie_entries(raw_value, target_url):
    parsed = urlparse(target_url)
    hostname = parsed.hostname or ""
    entries = []

    if isinstance(raw_value, dict):
        for name, value in raw_value.items():
            if value is None:
                continue
            entries.append(
                {
                    "name": str(name),
                    "value": str(value),
                    "domain": hostname,
                    "path": "/",
                    "secure": parsed.scheme == "https",
                    "httpOnly": False,
                }
            )
    elif isinstance(raw_value, list):
        for item in raw_value:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            entries.append(
                {
                    "name": name,
                    "value": str(item.get("value") or ""),
                    "domain": str(item.get("domain") or hostname or "").strip() or hostname,
                    "path": str(item.get("path") or "/").strip() or "/",
                    "secure": bool(item.get("secure", parsed.scheme == "https")),
                    "httpOnly": bool(item.get("httpOnly", False)),
                    "sameSite": str(item.get("sameSite") or "").strip(),
                    "expires": item.get("expires"),
                }
            )

    normalized = []
    for cookie in entries:
        if not cookie.get("domain") or not cookie.get("name"):
            continue
        payload = {
            "name": cookie["name"],
            "value": cookie["value"],
            "domain": cookie["domain"],
            "path": cookie.get("path") or "/",
            "secure": bool(cookie.get("secure", parsed.scheme == "https")),
            "httpOnly": bool(cookie.get("httpOnly", False)),
        }
        same_site = str(cookie.get("sameSite") or "").strip()
        if same_site:
            payload["sameSite"] = same_site
        expires = cookie.get("expires")
        if expires is not None:
            try:
                payload["expires"] = int(expires)
            except Exception:
                pass
        normalized.append(payload)
    return normalized


def _cookies_for_target(target_url):
    config, _path = _load_cookie_config_with_source()
    cookie_map = config.get("cookies") if isinstance(config.get("cookies"), dict) else {}
    hostname = urlparse(target_url).hostname or ""
    for candidate in _host_candidates(hostname):
        raw_value = cookie_map.get(candidate)
        if raw_value:
            return _normalize_cookie_entries(raw_value, target_url)
    return []


def _cookie_diagnostics_for_target(target_url):
    config, path = _load_cookie_config_with_source()
    cookie_map = config.get("cookies") if isinstance(config.get("cookies"), dict) else {}
    hostname = urlparse(target_url).hostname or ""

    configured_host = None
    raw_value = None
    for candidate in _host_candidates(hostname):
        candidate_value = cookie_map.get(candidate)
        if candidate_value:
            configured_host = candidate
            raw_value = candidate_value
            break

    normalized = _normalize_cookie_entries(raw_value, target_url) if raw_value else []
    return {
        "cookieFileExists": bool(os.path.exists(path)),
        "cookieConfigPath": path,
        "cookieHostConfigured": bool(configured_host),
        "configuredHost": configured_host,
        "nonEmptyCookieCount": len(normalized) if normalized else _count_non_empty_cookie_entries(raw_value),
    }


def _looks_blocked_text(value):
    text = str(value or "").strip().lower()
    if not text:
        return False
    return any(token in text for token in BLOCKED_TITLE_TOKENS)


def _clean_title(raw):
    title = re.sub(r"\s+", " ", str(raw or "")).strip()
    if not title:
        return None
    if _looks_blocked_text(title):
        return "CLOUDFLARE_BLOCK"
    return title


def _looks_generic_title(title, target_url):
    cleaned = str(title or "").strip()
    if not cleaned:
        return True
    if cleaned == "CLOUDFLARE_BLOCK":
        return False
    lowered = cleaned.lower()
    if lowered in {"home", "welcome", "index", "untitled", "loading"}:
        return True
    parsed = urlparse(target_url)
    hostname = (parsed.hostname or "").lower()
    if hostname and lowered in {hostname, hostname.replace("www.", "")}:
        return True
    slug = str(parsed.path or "").strip("/").split("/")[-1].lower()
    if slug and lowered == slug:
        return True
    return False


def _extract_title_from_snapshot(snapshot_text, target_url):
    lines = str(snapshot_text or "").splitlines()
    candidates = []

    role_scores = {
        "heading": 90,
        "document": 80,
        "main": 40,
        "paragraph": 52,
        "text": 28,
    }

    def _extract_role_value(line, role):
        quoted_match = re.search(rf'^\s*-\s+{role}\s+"([^"]+)"', line, re.IGNORECASE)
        if quoted_match:
            return quoted_match.group(1)
        colon_match = re.search(rf'^\s*-\s+{role}\s*:\s*(.+)$', line, re.IGNORECASE)
        if colon_match:
            return colon_match.group(1)
        return None

    reject_tokens = ("logo", "flag icon", "script icon", "ctrl k", "search", "home", "feed", "community", "compliance")

    for index, line in enumerate(lines[:220]):
        for role, base_score in role_scores.items():
            raw_value = _extract_role_value(line, role)
            if not raw_value:
                continue
            candidate = _clean_title(raw_value)
            if not candidate:
                continue
            lowered = candidate.lower()
            if any(token in lowered for token in reject_tokens):
                continue
            if len(candidate) > 180:
                continue
            score = base_score + len(candidate)
            if index < 25:
                score += 30
            elif index < 80:
                score += 15
            if not _looks_generic_title(candidate, target_url):
                score += 25
            if role == "paragraph" and len(candidate) >= 4:
                score += 20
            candidates.append((score, candidate))
            break

    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def _extract_description_from_snapshot(snapshot_text, title):
    lines = str(snapshot_text or "").splitlines()
    cleaned_title = str(title or "").strip()
    for line in lines[:140]:
        lowered = line.lower()
        if any(token in lowered for token in (' link "', ' button "', ' searchbox "', ' textbox "', ' checkbox "', ' navigation', ' menuitem "')):
            continue
        match = re.search(r'"([^"]+)"', line)
        if match:
            text = re.sub(r"\s+", " ", match.group(1)).strip()
        else:
            colon_match = re.search(r'^\s*-\s+(?:paragraph|text)\s*:\s*(.+)$', line, re.IGNORECASE)
            if not colon_match:
                continue
            text = re.sub(r"\s+", " ", colon_match.group(1)).strip()
        if len(text) < 40:
            continue
        if cleaned_title and text == cleaned_title:
            continue
        return text[:500]
    return None


def _title_tokens(value):
    tokens = []
    for token in re.findall(r"[a-z0-9]+", str(value or "").lower()):
        if len(token) < 4:
            continue
        if token in {"with", "from", "that", "this", "your", "have", "will", "into", "only", "video", "videos", "porn", "com"}:
            continue
        tokens.append(token)
    return tokens


def _score_title_overlap(text, page_title):
    candidate_tokens = set(_title_tokens(text))
    page_tokens = set(_title_tokens(page_title))
    if not candidate_tokens or not page_tokens:
        return 0
    overlap = candidate_tokens.intersection(page_tokens)
    if not overlap:
        return 0
    ratio = len(overlap) / max(1, min(len(candidate_tokens), len(page_tokens)))
    return min(80, int(len(overlap) * 10 + ratio * 40))


def _score_image_candidate(item, target_url, page_title=None):
    src = str((item or {}).get("src") or (item or {}).get("url") or "").strip()
    if not src:
        return -999
    lowered = src.lower()
    alt = re.sub(r"\s+", " ", str((item or {}).get("alt") or "")).strip()
    alt_lower = alt.lower()
    width = int((item or {}).get("width") or 0)
    height = int((item or {}).get("height") or 0)
    area = max(0, width) * max(0, height)
    candidate_source = str((item or {}).get("source") or "").strip().lower()
    candidate_class = str((item or {}).get("className") or "").strip().lower()
    candidate_id = str((item or {}).get("id") or "").strip().lower()
    candidate_title = re.sub(r"\s+", " ", str((item or {}).get("title") or "")).strip()

    reject_tokens = ("logo", "icon", "favicon", "avatar", "sprite", "badge", "emoji", "pixel", "banner")
    if any(
        token in lowered
        or token in alt_lower
        or token in candidate_class
        or token in candidate_id
        for token in reject_tokens
    ):
        return -250

    score = 0
    if candidate_source == "video_poster":
        score += 220
    elif candidate_source in {"og_image", "twitter_image", "jsonld_image"}:
        score += 180
    elif candidate_source in {"hero_image", "content_image"}:
        score += 110

    if area >= 300000:
        score += 130
    elif area >= 120000:
        score += 100
    elif area >= 60000:
        score += 75
    elif area >= 25000:
        score += 35

    if width >= 220 and height >= 220:
        score += 35
    elif width and height and (width < 80 or height < 80):
        score -= 70

    if alt:
        score += min(18, max(6, len(alt) // 8))
    if candidate_title:
        score += min(12, max(4, len(candidate_title) // 10))

    positive_tokens = ("cover", "poster", "thumb", "thumbnail", "preview", "gallery", "doujin", "manga", "comic", "image", "photo")
    if any(
        token in lowered
        or token in alt_lower
        or token in candidate_class
        or token in candidate_id
        for token in positive_tokens
    ):
        score += 18

    if lowered.endswith(".svg"):
        score -= 80

    if candidate_source not in {"video_poster", "og_image", "twitter_image", "jsonld_image"}:
        noisy_tokens = ("related", "recommended", "sidebar", "widget", "latest", "archive", "category")
        if any(
            token in lowered
            or token in alt_lower
            or token in candidate_class
            or token in candidate_id
            for token in noisy_tokens
        ):
            score -= 50

    overlap_text = " ".join(part for part in (alt, candidate_title) if part).strip()
    score += _score_title_overlap(overlap_text, page_title)

    try:
        target_host = (urlparse(target_url).hostname or "").lower()
        image_host = (urlparse(src).hostname or "").lower()
        if target_host and image_host and target_host == image_host:
            score += 10
    except Exception:
        pass

    return score


def _pick_cover(images, target_url, page_title=None, dom_candidates=None):
    best_src = None
    best_score = -999
    seen = set()
    merged_candidates = []
    for item in dom_candidates or []:
        if not isinstance(item, dict):
            continue
        merged_candidates.append(item)
    for item in images or []:
        if not isinstance(item, dict):
            continue
        merged_candidates.append(item)
    for item in merged_candidates:
        src = str((item or {}).get("src") or (item or {}).get("url") or "").strip()
        if not src:
            continue
        comparable = src.lower()
        if comparable in seen:
            continue
        seen.add(comparable)
        score = _score_image_candidate(item, target_url, page_title=page_title)
        if score > best_score:
            best_score = score
            best_src = src
    if best_score < 0:
        return None
    return best_src


def _pick_icon(images):
    best = None
    best_area = None
    for item in images or []:
        src = str((item or {}).get("src") or "").strip()
        if not src:
            continue
        width = int((item or {}).get("width") or 0)
        height = int((item or {}).get("height") or 0)
        area = max(0, width) * max(0, height)
        lowered = src.lower()
        if area <= 0 or area > 16384:
            continue
        if "icon" not in lowered and "favicon" not in lowered:
            continue
        if best_area is None or area > best_area:
            best_area = area
            best = src
    return best


def _extract_dom_metadata(tab_id, user_id, target_url):
    expression = r"""({
      title: document.title || null,
      canonicalUrl:
        document.querySelector('link[rel="canonical"]')?.href
        || document.querySelector('meta[property="og:url"]')?.content
        || location.href,
      description:
        document.querySelector('meta[name="description"]')?.content
        || document.querySelector('meta[property="og:description"]')?.content
        || document.querySelector('meta[name="twitter:description"]')?.content
        || null,
      icon:
        document.querySelector('link[rel="icon"]')?.href
        || document.querySelector('link[rel="shortcut icon"]')?.href
        || document.querySelector('link[rel="apple-touch-icon"]')?.href
        || null,
      coverCandidates: (() => {
        const seen = new Set();
        const out = [];
        const push = (rawUrl, source, extra = {}) => {
          const url = String(rawUrl || '').trim();
          if (!url || seen.has(url)) return;
          seen.add(url);
          out.push({
            src: url,
            source,
            alt: String(extra.alt || '').trim(),
            title: String(extra.title || '').trim(),
            width: Number(extra.width || 0) || 0,
            height: Number(extra.height || 0) || 0,
            className: String(extra.className || '').trim(),
            id: String(extra.id || '').trim(),
          });
        };
        push(document.querySelector('meta[property="og:image"]')?.content, 'og_image');
        push(document.querySelector('meta[property="og:image:secure_url"]')?.content, 'og_image');
        push(document.querySelector('meta[name="twitter:image"]')?.content, 'twitter_image');
        push(document.querySelector('meta[name="twitter:image:src"]')?.content, 'twitter_image');
        Array.from(document.querySelectorAll('video[poster]')).slice(0, 4).forEach((video) => {
          push(video.poster, 'video_poster', {
            width: video.videoWidth || video.clientWidth || video.offsetWidth || 0,
            height: video.videoHeight || video.clientHeight || video.offsetHeight || 0,
            className: video.className || '',
            id: video.id || '',
            title: video.getAttribute('title') || '',
          });
        });
        Array.from(document.querySelectorAll('main img, article img, figure img, [class*="cover"] img, [class*="poster"] img, [class*="hero"] img, [class*="featured"] img'))
          .slice(0, 16)
          .forEach((img) => {
            push(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'), 'content_image', {
              alt: img.alt || '',
              title: img.title || '',
              width: img.naturalWidth || img.width || 0,
              height: img.naturalHeight || img.height || 0,
              className: img.className || '',
              id: img.id || '',
            });
          });
        Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 8).forEach((script) => {
          const text = String(script.textContent || '').trim();
          if (!text) return;
          try {
            const parsed = JSON.parse(text);
            const stack = Array.isArray(parsed) ? parsed.slice() : [parsed];
            while (stack.length) {
              const item = stack.shift();
              if (!item) continue;
              if (Array.isArray(item)) {
                stack.push(...item);
                continue;
              }
              if (typeof item !== 'object') continue;
              const graph = item['@graph'];
              if (Array.isArray(graph)) stack.push(...graph);
              const image = item.image;
              if (typeof image === 'string') {
                push(image, 'jsonld_image');
              } else if (Array.isArray(image)) {
                image.forEach((entry) => {
                  if (typeof entry === 'string') push(entry, 'jsonld_image');
                  else if (entry && typeof entry === 'object') push(entry.url || entry.contentUrl, 'jsonld_image');
                });
              } else if (image && typeof image === 'object') {
                push(image.url || image.contentUrl, 'jsonld_image');
              }
            }
          } catch (error) {
          }
        });
        return out;
      })(),
    })"""
    response = _json_request(
        "POST",
        f"/tabs/{tab_id}/evaluate",
        payload={"userId": user_id, "expression": expression},
        timeout=20,
    )
    result = response.get("result")
    return result if isinstance(result, dict) else {}


def _build_metadata_from_snapshot(target_url, snapshot_text, images, page_url, dom_metadata=None):
    blocked = _looks_blocked_text(snapshot_text)
    dom_metadata = dom_metadata if isinstance(dom_metadata, dict) else {}
    snapshot_title = _extract_title_from_snapshot(snapshot_text, target_url)
    dom_title = _clean_title(dom_metadata.get("title"))
    title = snapshot_title
    if (not title or _looks_generic_title(title, target_url)) and dom_title and not _looks_generic_title(dom_title, target_url):
        title = dom_title
    elif not title and dom_title:
        title = dom_title
    if blocked and (not title or title != "CLOUDFLARE_BLOCK"):
        title = "CLOUDFLARE_BLOCK"

    metadata = {
        "title": title,
        "description": str(dom_metadata.get("description") or "").strip() or _extract_description_from_snapshot(snapshot_text, title),
        "icon": str(dom_metadata.get("icon") or "").strip() or _pick_icon(images),
        "coverUrl": _pick_cover(images, target_url, page_title=title or dom_title, dom_candidates=dom_metadata.get("coverCandidates")),
        "canonicalUrl": str(dom_metadata.get("canonicalUrl") or "").strip() or page_url or target_url,
        "quickLinks": [],
        "source": "Camofox",
    }
    metadata["blocked"] = bool(metadata.get("title") == "CLOUDFLARE_BLOCK" or blocked)
    metadata["genericTitle"] = _looks_generic_title(metadata.get("title"), target_url)
    metadata["quality"] = {
        "hasTitle": bool(metadata.get("title")),
        "blocked": metadata["blocked"],
        "genericTitle": metadata["genericTitle"],
        "hasCover": bool(metadata.get("coverUrl")),
        "hasDescription": bool(metadata.get("description")),
        "quickLinkCount": 0,
    }
    return metadata


def _is_client_disconnect(exc):
    if isinstance(exc, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
        return True
    if isinstance(exc, OSError):
        if getattr(exc, "winerror", None) in (10053, 10054):
            return True
        if exc.errno in (errno.EPIPE, errno.ECONNRESET, errno.ECONNABORTED):
            return True
    return False


def _safe_send_response(handler, status, content_type, body_bytes):
    try:
        handler.send_response(status)
        handler.send_header("Content-Type", content_type)
        handler.end_headers()
        if body_bytes:
            handler.wfile.write(body_bytes)
        return True
    except Exception as exc:
        if _is_client_disconnect(exc):
            logger.info("Camofox: Client disconnected before response write completed.")
            return False
        raise


def _start_log_thread(pipe, prefix):
    def _reader():
        try:
            for raw_line in iter(pipe.readline, ""):
                line = str(raw_line or "").rstrip()
                if not line:
                    continue
                _append_server_log(line)
                logger.info("Camofox%s %s", prefix, line)
        except Exception:
            return

    thread = threading.Thread(target=_reader, daemon=True)
    thread.start()
    return thread


def _server_env(port=None):
    env = os.environ.copy()
    env.setdefault("NODE_ENV", "development")
    env["CAMOFOX_PORT"] = str(port or _camofox_server_port())
    env.setdefault("SESSION_TIMEOUT_MS", "600000")
    env.setdefault("TAB_INACTIVITY_MS", "180000")
    env.setdefault("BROWSER_IDLE_TIMEOUT_MS", "180000")
    env.setdefault("MAX_TABS_PER_SESSION", "4")
    env.setdefault("MAX_TABS_GLOBAL", "8")
    env.setdefault("HANDLER_TIMEOUT_MS", "45000")
    return env


def _probe_health(timeout=3, port=None):
    try:
        payload = _json_request("GET", "/health", timeout=timeout, port=port)
        return bool(payload.get("ok") or payload.get("browserConnected") or payload.get("browserRunning"))
    except Exception:
        return False


def _terminate_server_process():
    global _SERVER_PROCESS, _ACTIVE_SERVER_PORT
    process = _SERVER_PROCESS
    _SERVER_PROCESS = None
    if not process:
        return
    _ACTIVE_SERVER_PORT = None
    try:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=5)
    except Exception:
        try:
            process.kill()
            process.wait(timeout=3)
        except Exception:
            pass


atexit.register(_terminate_server_process)


def is_camofox_runtime_available():
    return os.path.exists(_camofox_server_entry_path())


def ensure_camofox_server():
    global _SERVER_PROCESS, _ACTIVE_SERVER_PORT

    if not is_camofox_runtime_available():
        raise RuntimeError(
            "Camofox runtime is not installed. Run start-camofox-bridge.bat and choose Install/Update Camofox runtime first."
        )

    with _SERVER_LOCK:
        if _SERVER_PROCESS and _SERVER_PROCESS.poll() is None and _probe_health(timeout=3):
            return True

        if _probe_health(timeout=3):
            _ACTIVE_SERVER_PORT = current_camofox_server_port()
            return True

        _terminate_server_process()
        candidate_ports = _candidate_camofox_server_ports()
        last_tail = ""

        for index, candidate_port in enumerate(candidate_ports):
            if _probe_health(timeout=3, port=candidate_port):
                _ACTIVE_SERVER_PORT = candidate_port
                return True

            _SERVER_LOG_TAIL.clear()
            process = subprocess.Popen(
                [_node_binary(), _camofox_server_entry_path()],
                cwd=_runtime_root(),
                env=_server_env(candidate_port),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            _SERVER_PROCESS = process
            if process.stdout:
                _start_log_thread(process.stdout, "[server]")
            if process.stderr:
                _start_log_thread(process.stderr, "[server-err]")

            deadline = time.time() + DEFAULT_CAMOFOX_SERVER_START_TIMEOUT_SECONDS
            while time.time() < deadline:
                if process.poll() is not None:
                    break
                if _probe_health(timeout=3, port=candidate_port):
                    _ACTIVE_SERVER_PORT = candidate_port
                    return True
                time.sleep(0.5)

            tail = _server_log_tail_text()
            last_tail = tail
            _terminate_server_process()

            # The default upstream port may already be claimed on this machine.
            # When that happens, walk to the next local candidate instead of failing the bridge.
            if "port in use" in str(tail or "").lower() and index < len(candidate_ports) - 1:
                continue
            break

        message = "Camofox server failed to start."
        if last_tail:
            message = f"{message} {last_tail[-600:]}"
        raise RuntimeError(message)


def _json_request(method, path, payload=None, query=None, timeout=20, port=None):
    target_port = port or current_camofox_server_port()
    url = f"http://127.0.0.1:{target_port}{path}"
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method.upper(), headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            if not raw:
                return {}
            charset = response.headers.get_content_charset() or "utf-8"
            text = raw.decode(charset, errors="replace")
            if "application/json" in (response.headers.get("Content-Type") or "").lower():
                return json.loads(text or "{}")
            return {"text": text}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        detail = body.strip() or exc.reason
        raise RuntimeError(f"Camofox upstream {method} {path} failed with {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Camofox upstream {method} {path} failed: {exc.reason}") from exc


def _cleanup_session(user_id):
    if not user_id:
        return
    try:
        encoded = urllib.parse.quote(str(user_id), safe="")
        _json_request("DELETE", f"/sessions/{encoded}", timeout=10)
    except Exception:
        return


def fetch_camofox_metadata(target_url):
    ensure_camofox_server()
    user_id = f"eveos-{uuid.uuid4().hex[:12]}"
    tab_id = None
    snapshot_text = ""
    images = []
    page_url = target_url
    dom_metadata = {}
    cookies = _cookies_for_target(target_url)

    try:
        created = _json_request(
            "POST",
            "/tabs",
            payload={
                "userId": user_id,
                "sessionKey": "autotitle",
            },
            timeout=15,
        )
        tab_id = str(created.get("tabId") or "").strip()
        if not tab_id:
            raise RuntimeError("Camofox upstream did not return a tabId.")

        if cookies:
            encoded_user = urllib.parse.quote(user_id, safe="")
            _json_request(
                "POST",
                f"/sessions/{encoded_user}/cookies",
                payload={"cookies": cookies},
                timeout=15,
            )

        _json_request(
            "POST",
            f"/tabs/{tab_id}/navigate",
            payload={
                "userId": user_id,
                "url": target_url,
            },
            timeout=DEFAULT_CAMOFOX_FETCH_TIMEOUT_SECONDS,
        )
        _json_request(
            "POST",
            f"/tabs/{tab_id}/wait",
            payload={
                "userId": user_id,
                "timeout": 12000,
                "waitForNetwork": True,
            },
            timeout=20,
        )
        try:
            dom_metadata = _extract_dom_metadata(tab_id, user_id, target_url)
        except Exception:
            dom_metadata = {}
        snapshot_payload = _json_request(
            "GET",
            f"/tabs/{tab_id}/snapshot",
            query={"userId": user_id},
            timeout=20,
        )
        snapshot_text = str(snapshot_payload.get("snapshot") or "")
        page_url = str(snapshot_payload.get("url") or target_url)

        images_payload = _json_request(
            "GET",
            f"/tabs/{tab_id}/images",
            query={"userId": user_id, "limit": 12},
            timeout=20,
        )
        images = images_payload.get("images") if isinstance(images_payload.get("images"), list) else []

        metadata = _build_metadata_from_snapshot(target_url, snapshot_text, images, page_url, dom_metadata=dom_metadata)
        return {
            "metadata": metadata,
            "snapshot": snapshot_text,
            "images": images,
            "domMetadata": dom_metadata,
            "usedCookies": bool(cookies),
        }
    finally:
        _cleanup_session(user_id)


def handle_camofox_fetch(handler, query):
    target_url_list = query.get("url")
    response_format = str((query.get("format") or ["json"])[0] or "json").strip().lower()
    metadata_only = str((query.get("metadata_only") or ["0"])[0] or "0").strip().lower() in ("1", "true", "yes", "on")

    if not target_url_list:
        _safe_send_response(handler, HTTPStatus.BAD_REQUEST, "application/json", b'{"error":"Missing url parameter"}')
        return

    target_url = str(target_url_list[0] or "").strip()
    cookie_diagnostics = _cookie_diagnostics_for_target(target_url)
    log_path = os.path.join(_project_root(), "bin", "camofox_activity.log")

    def log_activity(message):
        try:
            from datetime import datetime
            timestamp = datetime.now().strftime("%H:%M:%S")
            with open(log_path, "a", encoding="utf-8") as handle:
                handle.write(f"[{timestamp}] {message}\n")
        except Exception:
            return

    logger.info("Camofox: Fetching URL: %s", target_url)
    log_activity(f"FETCH START: {target_url}")

    try:
        payload = fetch_camofox_metadata(target_url)
        metadata = payload.get("metadata") or {}
        snapshot_text = str(payload.get("snapshot") or "")
        images = payload.get("images") if isinstance(payload.get("images"), list) else []

        log_activity(
            "SUCCESS: {} (title={} cover={} cookies={})".format(
                target_url,
                metadata.get("title") or "",
                "yes" if metadata.get("coverUrl") else "no",
                "yes" if payload.get("usedCookies") else "no",
            )
        )

        body_payload = {
            "ok": True,
            "url": target_url,
            "metadata": metadata,
            "cookieDiagnostics": cookie_diagnostics,
            "usedCookies": bool(payload.get("usedCookies")),
        }
        if not metadata_only:
            body_payload["snapshot"] = snapshot_text
            body_payload["images"] = images
        body = json.dumps(body_payload).encode("utf-8")

        if response_format != "json":
            _safe_send_response(handler, HTTPStatus.OK, "text/plain; charset=utf-8", snapshot_text.encode("utf-8", errors="replace"))
            return

        _safe_send_response(handler, HTTPStatus.OK, "application/json", body)
    except Exception as exc:
        if _is_client_disconnect(exc):
            logger.info("Camofox: Client disconnected during response handling for %s", target_url)
            return
        logger.error("Camofox: Unexpected error: %s", exc)
        log_activity(f"FAILED: {target_url} ({exc})")
        error_payload = {
            "error": "Camofox execution failed",
            "details": str(exc),
            "cookieDiagnostics": cookie_diagnostics,
        }
        _safe_send_response(
            handler,
            HTTPStatus.INTERNAL_SERVER_ERROR,
            "application/json",
            json.dumps(error_payload).encode("utf-8"),
        )
