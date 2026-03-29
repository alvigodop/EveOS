import base64
import importlib.util
import json
import logging
import os
import re
import shlex
import socket
import subprocess
import errno
from html import unescape
from html.parser import HTMLParser
from http import HTTPStatus
from types import SimpleNamespace
from urllib.parse import urljoin, urlparse

logger = logging.getLogger("FandomDiscoveryServer")

DEFAULT_WSL_DISTRO = "Ubuntu"
DEFAULT_RENDER_TIMEOUT_SECONDS = 45
BLOCKED_TITLE_TOKENS = (
    "just a moment",
    "attention required! | cloudflare",
    "access denied",
    "403 forbidden",
    "404 not found",
    "too many requests",
    "cloudflare_block",
)


def _is_client_disconnect(exc):
    if isinstance(exc, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
        return True
    if isinstance(exc, OSError):
        winerror = getattr(exc, "winerror", None)
        if winerror in (10053, 10054):
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
            logger.info("Lightpanda: Client disconnected before response write completed.")
            return False
        raise


def _project_root():
    return (
        os.environ.get("EVEOS_PROJECT_ROOT")
        or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )


def _lightpanda_binary_path():
    explicit = (os.environ.get("EVEOS_LIGHTPANDA_BIN") or "").strip()
    if explicit:
        return explicit
    return os.path.join(_project_root(), "bin", "lightpanda")


def _wsl_distro():
    return (os.environ.get("EVEOS_LIGHTPANDA_WSL_DISTRO") or DEFAULT_WSL_DISTRO).strip() or DEFAULT_WSL_DISTRO


def _windows_to_wsl_path(path):
    normalized = os.path.abspath(path).replace("\\", "/")
    match = re.match(r"^([A-Za-z]):/(.*)$", normalized)
    if not match:
        return normalized
    drive = match.group(1).lower()
    remainder = match.group(2)
    return f"/mnt/{drive}/{remainder}"


def _build_lightpanda_command(target_url, include_frames=False, http_timeout_ms=15000):
    binary_path = _lightpanda_binary_path()
    binary_wsl_path = _windows_to_wsl_path(binary_path) if ":" in binary_path[:3] else binary_path
    target_url = str(target_url or "").strip()
    args = [
        shlex.quote(binary_wsl_path),
        "fetch",
        "--dump",
        "html",
        "--with_base",
        "--obey_robots",
        "--log_level",
        "error",
        "--http_timeout",
        str(int(http_timeout_ms)),
    ]
    if include_frames:
        args.append("--with_frames")
    args.append(shlex.quote(target_url))
    return [
        "wsl",
        "-d",
        _wsl_distro(),
        "bash",
        "-lc",
        " ".join(args),
    ]


def _local_runtime_root():
    explicit = (os.environ.get("EVEOS_LIGHTPANDA_RUNTIME_ROOT") or "").strip()
    if explicit:
        return explicit
    local_appdata = (os.environ.get("LOCALAPPDATA") or "").strip()
    if local_appdata:
        return os.path.join(local_appdata, "EveOS")
    return os.path.join(os.path.expanduser("~"), ".eveos")


def _local_cookie_config_path():
    explicit = (os.environ.get("EVEOS_LIGHTPANDA_COOKIE_CONFIG") or "").strip()
    if explicit:
        return explicit
    return os.path.join(_local_runtime_root(), "lightpanda-site-cookies.json")


def _load_local_cookie_config():
    path = _local_cookie_config_path()
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
            return payload if isinstance(payload, dict) else {}
    except Exception:
        logger.warning("Lightpanda: Failed to load local cookie config at %s", path)
        return {}


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
    base_url = f"{parsed.scheme or 'https'}://{hostname}/" if hostname else target_url
    entries = []

    if isinstance(raw_value, dict):
        iterator = raw_value.items()
        for name, value in iterator:
            if value is None:
                continue
            entries.append({
                "name": str(name),
                "value": str(value),
                "domain": hostname,
                "path": "/",
                "secure": parsed.scheme == "https",
            })
    elif isinstance(raw_value, list):
        for item in raw_value:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            value = str(item.get("value") or "")
            if not name:
                continue
            cookie = {
                "name": name,
                "value": value,
                "domain": str(item.get("domain") or hostname or "").strip() or hostname,
                "path": str(item.get("path") or "/").strip() or "/",
                "secure": bool(item.get("secure", parsed.scheme == "https")),
                "httpOnly": bool(item.get("httpOnly", False)),
            }
            if item.get("sameSite"):
                cookie["sameSite"] = str(item["sameSite"])
            if item.get("expires") is not None:
                try:
                    cookie["expires"] = int(item["expires"])
                except Exception:
                    pass
            entries.append(cookie)

    normalized = []
    for cookie in entries:
        domain = str(cookie.get("domain") or hostname or "").strip()
        if not domain:
            continue
        normalized_cookie = {
            "name": str(cookie.get("name") or "").strip(),
            "value": str(cookie.get("value") or ""),
            "domain": domain,
            "path": str(cookie.get("path") or "/").strip() or "/",
            "secure": bool(cookie.get("secure", parsed.scheme == "https")),
            "httpOnly": bool(cookie.get("httpOnly", False)),
            "url": base_url,
        }
        if not normalized_cookie["name"]:
            continue
        if cookie.get("sameSite"):
            normalized_cookie["sameSite"] = str(cookie["sameSite"])
        if cookie.get("expires") is not None:
            try:
                normalized_cookie["expires"] = int(cookie["expires"])
            except Exception:
                pass
        normalized.append(normalized_cookie)
    return normalized


def _cookies_for_target(target_url):
    parsed = urlparse(target_url)
    hostname = parsed.hostname or ""
    config = _load_local_cookie_config()
    cookie_map = config.get("cookies") if isinstance(config.get("cookies"), dict) else {}
    for candidate in _host_candidates(hostname):
        raw_value = cookie_map.get(candidate)
        if raw_value:
            return _normalize_cookie_entries(raw_value, target_url)
    return []


def _cookies_base64_for_target(target_url):
    cookies = _cookies_for_target(target_url)
    if not cookies:
        return ""
    return base64.b64encode(json.dumps(cookies).encode("utf-8")).decode("ascii")


def _cookie_dict_for_requests(target_url):
    cookies = _cookies_for_target(target_url)
    return {cookie["name"]: cookie["value"] for cookie in cookies if cookie.get("name")}


def _local_extractor_module_path():
    explicit = (os.environ.get("EVEOS_LIGHTPANDA_LOCAL_EXTRACTOR") or "").strip()
    if explicit:
        return explicit
    return os.path.join(_local_runtime_root(), "lightpanda_local_extractors.py")


def _run_local_extractor(target_url):
    module_path = _local_extractor_module_path()
    if not os.path.exists(module_path):
        return None
    try:
        spec = importlib.util.spec_from_file_location("eveos_lightpanda_local_extractors", module_path)
        if not spec or not spec.loader:
            return None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        extract_fn = getattr(module, "extract", None)
        if not callable(extract_fn):
            return None
        payload = extract_fn(target_url, _cookie_dict_for_requests(target_url))
        if not payload:
            return None
        if isinstance(payload, dict) and "metadata" in payload:
            return payload
        if isinstance(payload, dict):
            return {"metadata": payload, "html": ""}
        return None
    except Exception as exc:
        logger.warning("Lightpanda local extractor failed for %s: %s", target_url, exc)
        return None


def _build_lightpanda_serve_command(port, timeout_seconds=DEFAULT_RENDER_TIMEOUT_SECONDS):
    binary_path = _lightpanda_binary_path()
    binary_wsl_path = _windows_to_wsl_path(binary_path) if ":" in binary_path[:3] else binary_path
    return [
        "wsl",
        "-d",
        _wsl_distro(),
        "bash",
        "-lc",
        (
            f"{shlex.quote(binary_wsl_path)} serve "
            f"--host 127.0.0.1 --port {int(port)} --timeout {int(timeout_seconds)} "
            "--obey_robots --log_level error"
        ),
    ]


def is_lightpanda_available():
    return os.path.exists(_lightpanda_binary_path())


def _decode_lightpanda_stream(raw_bytes):
    if raw_bytes is None:
        return ""
    if isinstance(raw_bytes, str):
        return raw_bytes
    for encoding in ("utf-8", "utf-8-sig"):
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("utf-8", errors="replace")


def fetch_lightpanda_html(target_url, timeout=30, include_frames=False, http_timeout_ms=15000):
    if not is_lightpanda_available():
        raise FileNotFoundError(f"Lightpanda binary not found at {_lightpanda_binary_path()}")
    cmd = _build_lightpanda_command(target_url, include_frames=include_frames, http_timeout_ms=http_timeout_ms)
    result = subprocess.run(cmd, capture_output=True, text=False, timeout=timeout)
    return SimpleNamespace(
        returncode=result.returncode,
        stdout=_decode_lightpanda_stream(result.stdout),
        stderr=_decode_lightpanda_stream(result.stderr),
    )


def _looks_blocked_title(title):
    clean = str(title or "").strip().lower()
    if not clean:
        return False
    return any(token in clean for token in BLOCKED_TITLE_TOKENS)


def _looks_generic_title(title, target_url):
    clean = str(title or "").strip().lower()
    if not clean:
        return True
    if len(clean) < 4:
        return True
    generic_patterns = ("view video", "watch video", "home", "welcome", "index", "untitled", "loading", "please wait")
    if any(pattern in clean for pattern in generic_patterns):
        return True
    try:
        parsed = urlparse(target_url)
        domain = parsed.hostname.replace("www.", "").split(".")[0].lower()
        normalized_title = re.sub(r"[^a-z0-9]", "", clean)
        if normalized_title in {domain, f"{domain}com", f"{domain}org", f"{domain}net"} and len(parsed.path or "") > 1:
            return True
    except Exception:
        pass
    return False


def _truncate_text(value, limit):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return f"{text[:max(0, limit - 3)].rstrip()}..."



class _LightpandaHtmlMetadataParser(HTMLParser):
    def __init__(self, target_url):
        super().__init__(convert_charrefs=True)
        self.target_url = target_url
        self.base_url = target_url
        self.title_parts = []
        self.in_title = False
        self.meta = {}
        self.icon = None
        self.apple_icon = None
        self.canonical = None
        self.anchors = []
        self._anchor_href = None
        self._anchor_text_parts = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = {str(key).lower(): value for key, value in attrs}
        tag = str(tag or "").lower()

        if tag == "title":
            self.in_title = True
            return

        if tag == "base":
            href = attrs_dict.get("href")
            if href:
                self.base_url = urljoin(self.base_url, href)
            return

        if tag == "meta":
            key = (attrs_dict.get("property") or attrs_dict.get("name") or "").strip().lower()
            content = (attrs_dict.get("content") or "").strip()
            if key and content and key not in self.meta:
                self.meta[key] = content
            return

        if tag == "link":
            rel_tokens = {token.strip().lower() for token in str(attrs_dict.get("rel") or "").split() if token.strip()}
            href = (attrs_dict.get("href") or "").strip()
            if not href:
                return
            absolute_href = urljoin(self.base_url, href)
            if "canonical" in rel_tokens and not self.canonical:
                self.canonical = absolute_href
            if any(token in rel_tokens for token in ("icon", "shortcut", "shortcut icon")) and not self.icon:
                self.icon = absolute_href
            if "apple-touch-icon" in rel_tokens and not self.apple_icon:
                self.apple_icon = absolute_href
            return

        if tag == "a":
            href = (attrs_dict.get("href") or "").strip()
            if href:
                self._anchor_href = urljoin(self.base_url, href)
                self._anchor_text_parts = []

    def handle_data(self, data):
        if self.in_title:
            self.title_parts.append(data)
        if self._anchor_href:
            self._anchor_text_parts.append(data)

    def handle_endtag(self, tag):
        tag = str(tag or "").lower()
        if tag == "title":
            self.in_title = False
            return
        if tag == "a" and self._anchor_href:
            text = _truncate_text(unescape(" ".join(self._anchor_text_parts)), 120)
            self.anchors.append({"href": self._anchor_href, "text": text})
            self._anchor_href = None
            self._anchor_text_parts = []

    def extracted_title(self):
        candidates = [
            self.meta.get("og:title"),
            self.meta.get("twitter:title"),
            "".join(self.title_parts).strip(),
        ]
        for candidate in candidates:
            candidate = _truncate_text(unescape(candidate or ""), 300)
            if candidate:
                return candidate
        return None


def _pick_cover(parser):
    candidates = [
        parser.meta.get("og:image"),
        parser.meta.get("og:image:secure_url"),
        parser.meta.get("twitter:image"),
        parser.meta.get("twitter:image:src"),
    ]
    for candidate in candidates:
        if candidate:
            return urljoin(parser.base_url, candidate)
    return None


def _pick_description(parser):
    candidates = [
        parser.meta.get("og:description"),
        parser.meta.get("twitter:description"),
        parser.meta.get("description"),
    ]
    for candidate in candidates:
        text = _truncate_text(unescape(candidate or ""), 500)
        if text:
            return text
    return None


def _pick_icon(parser):
    return parser.icon or parser.apple_icon


def _extract_quick_links(parser):
    target_host = ""
    try:
        target_host = urlparse(parser.target_url).hostname or ""
    except Exception:
        pass

    quick_links = []
    seen = set()
    for anchor in parser.anchors:
        href = str(anchor.get("href") or "").strip()
        text = str(anchor.get("text") or "").strip()
        if not href or not text:
            continue
        if href.startswith(("javascript:", "mailto:", "tel:")):
            continue
        parsed = urlparse(href)
        if parsed.scheme not in ("http", "https"):
            continue
        if target_host and parsed.hostname and parsed.hostname != target_host:
            continue
        if len(text) < 2:
            continue
        key = (href, text.lower())
        if key in seen:
            continue
        seen.add(key)
        quick_links.append({"text": text, "url": href})
        if len(quick_links) >= 8:
            break
    return quick_links


def extract_lightpanda_metadata(html_content, target_url):
    parser = _LightpandaHtmlMetadataParser(target_url)
    try:
        parser.feed(html_content or "")
        parser.close()
    except Exception:
        pass

    title = parser.extracted_title()
    metadata = {
        "title": title,
        "description": _pick_description(parser),
        "icon": _pick_icon(parser),
        "coverUrl": _pick_cover(parser),
        "canonicalUrl": parser.canonical or target_url,
        "quickLinks": _extract_quick_links(parser),
        "source": "Lightpanda",
    }
    metadata["blocked"] = _looks_blocked_title(metadata["title"])
    metadata["genericTitle"] = _looks_generic_title(metadata["title"], target_url)
    metadata["quality"] = {
        "hasTitle": bool(metadata["title"]),
        "blocked": metadata["blocked"],
        "genericTitle": metadata["genericTitle"],
        "hasCover": bool(metadata["coverUrl"]),
        "hasDescription": bool(metadata["description"]),
        "quickLinkCount": len(metadata["quickLinks"]),
    }
    return metadata


def _is_weak_metadata(metadata):
    if not metadata:
        return True
    if metadata.get("blocked"):
        return True
    if not metadata.get("title"):
        return True
    if metadata.get("genericTitle"):
        return True
    return False


def _metadata_score(metadata):
    if not metadata:
        return -999
    score = 0
    if metadata.get("title"):
        score += 50
    if not metadata.get("genericTitle"):
        score += 35
    if not metadata.get("blocked"):
        score += 20
    if metadata.get("coverUrl"):
        score += 35
    if metadata.get("description"):
        score += 10
    if metadata.get("icon"):
        score += 8
    if metadata.get("canonicalUrl"):
        score += 5
    score += min(12, len(metadata.get("quickLinks") or []) * 2)
    return score


def _merge_metadata(primary, candidate, target_url):
    if not primary:
        return candidate
    if not candidate:
        return primary

    merged = dict(primary)
    if not primary.get("title") or primary.get("blocked") or primary.get("genericTitle"):
        merged["title"] = candidate.get("title") or primary.get("title")
    elif _metadata_score(candidate) > _metadata_score(primary):
        merged["title"] = candidate.get("title") or primary.get("title")

    for key in ("coverUrl", "icon", "canonicalUrl"):
        if candidate.get(key) and (not merged.get(key) or key == "canonicalUrl"):
            merged[key] = candidate.get(key)

    if candidate.get("description") and (not merged.get("description") or len(candidate["description"]) > len(merged.get("description") or "")):
        merged["description"] = candidate["description"]

    if len(candidate.get("quickLinks") or []) > len(merged.get("quickLinks") or []):
        merged["quickLinks"] = candidate.get("quickLinks") or []

    merged["blocked"] = _looks_blocked_title(merged.get("title"))
    merged["genericTitle"] = _looks_generic_title(merged.get("title"), target_url)
    merged["quality"] = {
        "hasTitle": bool(merged.get("title")),
        "blocked": merged["blocked"],
        "genericTitle": merged["genericTitle"],
        "hasCover": bool(merged.get("coverUrl")),
        "hasDescription": bool(merged.get("description")),
        "quickLinkCount": len(merged.get("quickLinks") or []),
    }
    return merged


def _find_free_local_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _render_extract_with_playwright(target_url):
    helper_script = os.path.join(_project_root(), "server_modules", "lightpanda_render_extract.js")
    if not os.path.exists(helper_script):
        return None

    try:
        binary_path = _lightpanda_binary_path()
        binary_wsl_path = _windows_to_wsl_path(binary_path) if ":" in binary_path[:3] else binary_path
        cookies_arg = _cookies_base64_for_target(target_url)
        result = subprocess.run(
            [
                "wsl",
                "-d",
                _wsl_distro(),
                "bash",
                "-lc",
                (
                    f"cd {shlex.quote(_windows_to_wsl_path(_project_root()))} && "
                    f"node {shlex.quote(_windows_to_wsl_path(helper_script))} "
                    f"{shlex.quote(binary_wsl_path)} "
                    f"{shlex.quote(str(target_url))} "
                    f"{shlex.quote(cookies_arg)}"
                ),
            ],
            capture_output=True,
            text=False,
            timeout=DEFAULT_RENDER_TIMEOUT_SECONDS + 20,
        )
        if result.returncode != 0:
            logger.warning("Lightpanda rendered extraction failed: %s", _decode_lightpanda_stream(result.stderr).strip()[:300])
            return None

        output = _decode_lightpanda_stream(result.stdout).strip()
        if not output:
            return None

        payload = json.loads(output)
        metadata = dict(payload.get("metadata") or {})
        metadata["blocked"] = _looks_blocked_title(metadata.get("title"))
        metadata["genericTitle"] = _looks_generic_title(metadata.get("title"), target_url)
        metadata["quality"] = {
            "hasTitle": bool(metadata.get("title")),
            "blocked": metadata["blocked"],
            "genericTitle": metadata["genericTitle"],
            "hasCover": bool(metadata.get("coverUrl")),
            "hasDescription": bool(metadata.get("description")),
            "quickLinkCount": len(metadata.get("quickLinks") or []),
        }
        return {
            "metadata": metadata,
            "html": str(payload.get("html") or ""),
        }
    except Exception:
        return None



def _fetch_with_upgrade(target_url):
    primary = fetch_lightpanda_html(target_url, timeout=30, include_frames=False, http_timeout_ms=15000)
    primary_html = primary.stdout or ""
    primary_metadata = extract_lightpanda_metadata(primary_html, target_url)
    best_result = primary
    best_html = primary_html
    best_metadata = primary_metadata
    used_retry = False
    used_local_extractor = False

    if primary.returncode == 0 and (_is_weak_metadata(primary_metadata) or not primary_metadata.get("coverUrl")):
        retry = fetch_lightpanda_html(target_url, timeout=45, include_frames=True, http_timeout_ms=22000)
        retry_html = retry.stdout or ""
        retry_metadata = extract_lightpanda_metadata(retry_html, target_url)

        if retry.returncode == 0 and _metadata_score(retry_metadata) > _metadata_score(best_metadata):
            best_result = retry
            best_html = retry_html
            best_metadata = retry_metadata
            used_retry = True

    if best_result.returncode != 0 or _is_weak_metadata(best_metadata) or not best_metadata.get("coverUrl"):
        local_payload = _run_local_extractor(target_url)
        local_metadata = (local_payload or {}).get("metadata")
        local_html = str((local_payload or {}).get("html") or "")
        if local_metadata:
            best_metadata = _merge_metadata(best_metadata, local_metadata, target_url)
            if best_result.returncode != 0:
                best_result = SimpleNamespace(returncode=0, stdout=local_html, stderr="")
                best_html = local_html
            elif local_html and len(local_html) > len(best_html or ""):
                best_html = local_html
            used_local_extractor = True

    used_rendered = False
    if best_result.returncode != 0 or _is_weak_metadata(best_metadata) or not best_metadata.get("coverUrl"):
        rendered_payload = _render_extract_with_playwright(target_url)
        rendered_metadata = (rendered_payload or {}).get("metadata")
        rendered_html = str((rendered_payload or {}).get("html") or "")
        if rendered_metadata:
            best_metadata = _merge_metadata(best_metadata, rendered_metadata, target_url)
            if best_result.returncode != 0:
                best_result = SimpleNamespace(returncode=0, stdout=rendered_html, stderr="")
                best_html = rendered_html
            elif rendered_html and len(rendered_html) > len(best_html or ""):
                best_html = rendered_html
            used_rendered = True

    return best_result, best_html, best_metadata, used_retry, used_rendered, used_local_extractor



def handle_lightpanda_fetch(handler, query):
    """Handle requests to /api/lightpanda?url=..."""
    target_url_list = query.get("url")
    response_format = str((query.get("format") or ["html"])[0] or "html").strip().lower()
    metadata_only = str((query.get("metadata_only") or ["0"])[0] or "0").strip().lower() in ("1", "true", "yes", "on")

    if not target_url_list:
        _safe_send_response(handler, HTTPStatus.BAD_REQUEST, "application/json", b'{"error": "Missing url parameter"}')
        return

    if os.environ.get("EVEOS_LIGHTPANDA_DISABLED") == "1":
        logger.info("Lightpanda: Fetch requested but bridge is currently DISABLED via toggle.")
        _safe_send_response(handler, HTTPStatus.SERVICE_UNAVAILABLE, "application/json", b'{"error": "Lightpanda bridge is disabled"}')
        return

    log_path = os.path.join(_project_root(), "bin", "lightpanda_activity.log")

    def log_activity(msg):
        try:
            from datetime import datetime
            timestamp = datetime.now().strftime("%H:%M:%S")
            with open(log_path, "a", encoding="utf-8") as handle:
                handle.write(f"[{timestamp}] {msg}\n")
        except Exception:
            pass

    target_url = target_url_list[0]
    logger.info(f"Lightpanda: Fetching URL: {target_url}")
    log_activity(f"FETCH START: {target_url}")

    try:
        result, content, metadata, used_retry, used_rendered, used_local_extractor = _fetch_with_upgrade(target_url)

        if result.returncode == 0:
            logger.info(f"Lightpanda: Successfully fetched {len(content)} bytes from {target_url}")
            if used_retry:
                log_activity(f"SUCCESS-RETRY: {target_url} ({len(content)} bytes)")
            else:
                log_activity(f"SUCCESS: {target_url} ({len(content)} bytes)")

            if response_format == "json":
                payload = {
                    "ok": True,
                    "url": target_url,
                    "metadata": metadata,
                    "retriedWithFrames": bool(used_retry),
                    "usedRenderedExtraction": bool(used_rendered),
                    "usedLocalExtractor": bool(used_local_extractor),
                }
                if not metadata_only:
                    payload["html"] = content
                body = json.dumps(payload).encode("utf-8")
                _safe_send_response(handler, HTTPStatus.OK, "application/json", body)
                return

            _safe_send_response(handler, HTTPStatus.OK, "text/html; charset=utf-8", content.encode("utf-8"))
            return

        logger.warning(f"Lightpanda: Execution failed with return code {result.returncode}")
        log_activity(f"FAILED: {target_url} (Code: {result.returncode})")
        if result.stderr:
            log_activity(f"  ERR: {result.stderr.strip()[:180]}")

        error_msg = json.dumps({
            "error": "Lightpanda execution failed",
            "details": result.stderr,
        })
        _safe_send_response(handler, HTTPStatus.INTERNAL_SERVER_ERROR, "application/json", error_msg.encode("utf-8"))

    except subprocess.TimeoutExpired:
        logger.warning(f"Lightpanda: Timeout fetching {target_url}")
        log_activity(f"TIMEOUT: {target_url}")
        _safe_send_response(handler, HTTPStatus.GATEWAY_TIMEOUT, "application/json", b'{"error": "Lightpanda fetch timed out"}')

    except Exception as exc:
        if _is_client_disconnect(exc):
            logger.info("Lightpanda: Client disconnected during response handling for %s", target_url)
            return
        logger.error(f"Lightpanda: Unexpected error: {str(exc)}")
        error_msg = json.dumps({
            "error": "Internal Server Error",
            "details": str(exc),
        })
        _safe_send_response(handler, HTTPStatus.INTERNAL_SERVER_ERROR, "application/json", error_msg.encode("utf-8"))
