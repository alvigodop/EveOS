import gzip
import html
import ipaddress
import json
import logging
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus

from server_modules import proxy

logger = logging.getLogger("FandomDiscoveryServer")

from server_modules.popup_viewer_document import (
    _build_fallback_document,
    _send_html,
    _send_json_error,
    build_popup_document,
)
from server_modules.popup_viewer_http import _decode_text, _open_target, is_popup_target_allowed
from server_modules.popup_viewer_rewrite import _extract_target_url

def handle_popup_view(handler, query):
    target_url = _extract_target_url(handler, query, "view")
    allowed, reason = is_popup_target_allowed(target_url)
    if not allowed:
        _send_json_error(handler, HTTPStatus.FORBIDDEN, reason, target_url=target_url)
        return

    try:
        upstream = _open_target(target_url, method="GET", prefer_html=True)
        final_url = str(upstream.get("url") or target_url).strip() or target_url
        content_type = str(upstream.get("content_type") or "text/html")
        body = upstream.get("body") or b""

        if "html" not in content_type.lower():
            fallback_html = _build_fallback_document(
                final_url,
                f'The popup bridge received "{content_type}" instead of an HTML page.',
            )
            _send_html(handler, fallback_html, status=HTTPStatus.OK)
            return

        raw_html = _decode_text(body, content_type)
        bridge_host = str(handler.headers.get("Host") or "127.0.0.1").strip()
        bridge_base = f"http://{bridge_host}"
        popup_document = build_popup_document(final_url, raw_html, bridge_base=bridge_base)
        _send_html(handler, popup_document, status=HTTPStatus.OK)
    except urllib.error.HTTPError as http_error:
        body = _build_fallback_document(
            target_url,
            f"Upstream request failed with HTTP {http_error.code}.",
        )
        _send_html(handler, body, status=HTTPStatus.BAD_GATEWAY)
    except urllib.error.URLError as url_error:
        body = _build_fallback_document(
            target_url,
            f"Network error while loading popup content: {url_error.reason}",
        )
        _send_html(handler, body, status=HTTPStatus.BAD_GATEWAY)
    except Exception as exc:
        logger.error("Popup bridge unexpected view error for %s: %s", target_url, exc)
        body = _build_fallback_document(
            target_url,
            f"Unexpected popup bridge error: {exc}",
        )
        _send_html(handler, body, status=HTTPStatus.INTERNAL_SERVER_ERROR)

def handle_popup_resource_request(handler, query):
    target_url = _extract_target_url(handler, query, "resource")
    allowed, reason = is_popup_target_allowed(target_url)
    if not allowed:
        _send_json_error(handler, HTTPStatus.FORBIDDEN, reason, target_url=target_url)
        return

    method = str(getattr(handler, "command", "GET") or "GET").upper()
    body = None
    if method == "POST":
        content_length = int(handler.headers.get("Content-Length", 0) or 0)
        body = handler.rfile.read(content_length) if content_length > 0 else None

    incoming_headers = {
        "Accept": handler.headers.get("Accept", ""),
        "Content-Type": handler.headers.get("Content-Type", ""),
    }

    try:
        upstream = _open_target(
            target_url,
            method=method,
            body=body,
            incoming_headers=incoming_headers,
            prefer_html=False,
        )
        content_type = str(upstream.get("content_type") or "application/octet-stream")
        response_body = upstream.get("body") or b""

        handler.send_response(HTTPStatus.OK)
        handler.send_header("Content-Type", content_type)
        handler.end_headers()
        handler.wfile.write(response_body)
    except urllib.error.HTTPError as http_error:
        try:
            error_body = http_error.read()
        except Exception:
            error_body = str(http_error).encode("utf-8", errors="replace")
        handler.send_response(http_error.code)
        handler.send_header("Content-Type", http_error.headers.get("Content-Type", "text/plain"))
        handler.end_headers()
        handler.wfile.write(error_body)
    except urllib.error.URLError as url_error:
        _send_json_error(
            handler,
            HTTPStatus.BAD_GATEWAY,
            f"Failed to reach upstream popup resource: {url_error.reason}",
            target_url=target_url,
        )
    except Exception as exc:
        logger.error("Popup bridge unexpected resource error for %s: %s", target_url, exc)
        _send_json_error(
            handler,
            HTTPStatus.INTERNAL_SERVER_ERROR,
            f"Unexpected popup bridge resource error: {exc}",
            target_url=target_url,
        )
