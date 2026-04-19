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

from server_modules.lightpanda_shared import DEFAULT_RENDER_TIMEOUT_SECONDS, DEFAULT_WSL_DISTRO

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

def _cookie_diagnostics_for_target(target_url):
    parsed = urlparse(target_url)
    hostname = parsed.hostname or ""
    path = _local_cookie_config_path()
    file_exists = os.path.exists(path)
    config = _load_local_cookie_config() if file_exists else {}
    cookie_map = config.get("cookies") if isinstance(config.get("cookies"), dict) else {}

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
        "cookieFileExists": bool(file_exists),
        "cookieConfigPath": path,
        "cookieHostConfigured": bool(configured_host),
        "configuredHost": configured_host,
        "nonEmptyCookieCount": len(normalized) if normalized else _count_non_empty_cookie_entries(raw_value),
    }

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
