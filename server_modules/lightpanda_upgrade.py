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

from server_modules.lightpanda_metadata import (
    _is_weak_metadata,
    _looks_blocked_title,
    _looks_generic_title,
    _merge_metadata,
    _metadata_score,
    extract_lightpanda_metadata,
)
from server_modules.lightpanda_runtime import (
    _cookies_base64_for_target,
    _decode_lightpanda_stream,
    _lightpanda_binary_path,
    _project_root,
    _run_local_extractor,
    _windows_to_wsl_path,
    _wsl_distro,
    fetch_lightpanda_html,
)
from server_modules.lightpanda_shared import DEFAULT_RENDER_TIMEOUT_SECONDS

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
