import gzip
import html
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
from server_modules.outbound_http import build_public_opener, validate_public_http_target

logger = logging.getLogger("FandomDiscoveryServer")

DEFAULT_BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

def is_popup_target_allowed(target_url):
    return validate_public_http_target(target_url)

def _read_response_body(response):
    raw_content = response.read()
    content_encoding = str(response.getheader("Content-Encoding", "") or "").lower()
    if "gzip" in content_encoding:
        try:
            return gzip.decompress(raw_content)
        except OSError:
            logger.warning("Popup bridge failed to decompress gzip response; using raw bytes")
    return raw_content

def _retry_after_seconds(retry_after_value):
    if not retry_after_value:
        return 0.0

    try:
        return max(0.0, float(retry_after_value))
    except (TypeError, ValueError):
        return 0.0

def _request_headers(target_url, incoming_headers=None, prefer_html=False):
    incoming_headers = incoming_headers or {}
    is_wikimedia = proxy._is_wikimedia_request(target_url)
    default_accept = (
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8"
        if prefer_html
        else "*/*"
    )
    accept_header = str(incoming_headers.get("Accept") or default_accept)
    content_type = str(incoming_headers.get("Content-Type") or "").strip()

    headers = {
        "User-Agent": proxy.WMF_USER_AGENT if is_wikimedia else DEFAULT_BROWSER_USER_AGENT,
        "Accept": accept_header,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip",
        "Connection": "keep-alive",
        "Cache-Control": "no-cache",
    }
    if content_type:
        headers["Content-Type"] = content_type

    referer = proxy._origin_referer(target_url)
    if referer:
        headers["Referer"] = referer

    return headers

def _open_target(target_url, method="GET", body=None, incoming_headers=None, prefer_html=False):
    headers = _request_headers(target_url, incoming_headers=incoming_headers, prefer_html=prefer_html)
    request = urllib.request.Request(
        target_url,
        data=body,
        headers=headers,
        method=str(method or "GET").upper(),
    )

    ssl_context = ssl.create_default_context()
    opener = build_public_opener(ssl_context=ssl_context)

    last_http_error = None
    is_wikimedia = proxy._is_wikimedia_request(target_url)

    for attempt in range(2 if is_wikimedia else 1):
        try:
            if is_wikimedia:
                proxy._throttle_wikimedia_request()

            with opener.open(request, timeout=30) as response:
                return {
                    "url": response.geturl(),
                    "content_type": response.getheader("Content-Type", "application/octet-stream"),
                    "body": _read_response_body(response),
                }
        except urllib.error.HTTPError as http_error:
            last_http_error = http_error
            if is_wikimedia and http_error.code == HTTPStatus.TOO_MANY_REQUESTS and attempt == 0:
                retry_after = _retry_after_seconds(http_error.headers.get("Retry-After"))
                if retry_after > 0:
                    logger.warning("Popup bridge backing off Wikimedia request for %.2fs", retry_after)
                    time.sleep(retry_after)
                    continue
            raise

    if last_http_error is not None:
        raise last_http_error

    raise RuntimeError("Popup bridge request failed without a response")

def _decode_text(body_bytes, content_type):
    content_type = str(content_type or "")
    charset_match = _CONTENT_TYPE_CHARSET_RE.search(content_type)
    charset = charset_match.group(1).strip(" '\"") if charset_match else "utf-8"

    try:
        return body_bytes.decode(charset, errors="replace")
    except LookupError:
        return body_bytes.decode("utf-8", errors="replace")
