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
