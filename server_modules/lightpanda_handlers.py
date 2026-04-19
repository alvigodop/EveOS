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

from server_modules.lightpanda_runtime import _cookie_diagnostics_for_target, _project_root
from server_modules.lightpanda_shared import _is_client_disconnect, _safe_send_response
from server_modules.lightpanda_upgrade import _fetch_with_upgrade

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
    cookie_diagnostics = _cookie_diagnostics_for_target(target_url)
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
                    "cookieDiagnostics": cookie_diagnostics,
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
