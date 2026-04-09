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

DEFAULT_BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_CONTENT_TYPE_CHARSET_RE = re.compile(r"charset=([^\s;]+)", re.I)
_CSP_META_RE = re.compile(
    r"<meta[^>]+http-equiv\s*=\s*['\"]?Content-Security-Policy['\"]?[^>]*>",
    re.I,
)
_META_REFRESH_RE = re.compile(
    r"<meta[^>]+http-equiv\s*=\s*['\"]?refresh['\"]?[^>]*>",
    re.I,
)
_BASE_TAG_RE = re.compile(r"<base\b[^>]*>", re.I)
_HEAD_TAG_RE = re.compile(r"<head([^>]*)>", re.I)


def is_popup_target_allowed(target_url):
    normalized = str(target_url or "").strip()
    if not normalized:
        return False, "Missing target URL"

    try:
        parsed = urllib.parse.urlparse(normalized)
    except Exception:
        return False, "Invalid target URL"

    scheme = str(parsed.scheme or "").lower()
    host = str(parsed.hostname or "").strip().lower()
    if scheme not in ("http", "https"):
        return False, "Popup bridge only allows http and https targets"
    if not host:
        return False, "Target host is missing"

    if host in ("localhost",) or host.endswith(".localhost"):
        return False, "Loopback hosts are not allowed"
    if host.endswith(".local") or host.endswith(".internal") or host.endswith(".lan"):
        return False, "Private hostname targets are not allowed"

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None

    if ip:
        if ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False, "Private or local network targets are not allowed"

    return True, ""


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
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    last_http_error = None
    is_wikimedia = proxy._is_wikimedia_request(target_url)

    for attempt in range(2 if is_wikimedia else 1):
        try:
            if is_wikimedia:
                proxy._throttle_wikimedia_request()

            with urllib.request.urlopen(request, timeout=30, context=ssl_context) as response:
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


def _bridge_shim(target_url):
    target_json = json.dumps(str(target_url or ""))
    return f"""
<script>
(function () {{
    var TARGET_URL = {target_json};
    var VIEW_PREFIX = '/api/popup-view?url=';
    var RESOURCE_PREFIX = '/api/popup-resource?url=';

    function createMemoryStorage() {{
        var data = Object.create(null);
        return {{
            getItem: function (key) {{
                key = String(key);
                return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
            }},
            setItem: function (key, value) {{
                data[String(key)] = String(value);
            }},
            removeItem: function (key) {{
                delete data[String(key)];
            }},
            clear: function () {{
                data = Object.create(null);
            }},
            key: function (index) {{
                var keys = Object.keys(data);
                return typeof index === 'number' && index >= 0 && index < keys.length ? keys[index] : null;
            }},
            get length() {{
                return Object.keys(data).length;
            }}
        }};
    }}

    function installStorageFallback(name) {{
        try {{
            void window[name];
        }} catch (error) {{
            try {{
                Object.defineProperty(window, name, {{
                    configurable: true,
                    enumerable: true,
                    value: createMemoryStorage()
                }});
            }} catch (_error) {{}}
        }}
    }}

    installStorageFallback('localStorage');
    installStorageFallback('sessionStorage');

    try {{
        void document.cookie;
    }} catch (error) {{
        var cookieValue = '';
        try {{
            Object.defineProperty(Document.prototype, 'cookie', {{
                configurable: true,
                get: function () {{
                    return cookieValue;
                }},
                set: function (value) {{
                    cookieValue = String(value || '');
                }}
            }});
        }} catch (_error) {{}}
    }}

    function isBridgeUrl(rawUrl) {{
        var value = String(rawUrl || '');
        return /^\\/api\\/popup-(?:view|resource)\\?url=/i.test(value)
            || /^https?:\\/\\/(127\\.0\\.0\\.1|localhost)(:\\d+)?\\/api\\/popup-(?:view|resource)\\?url=/i.test(value);
    }}

    function resolveUrl(rawUrl) {{
        var value = String(rawUrl || '').trim();
        if (!value) return '';
        if (isBridgeUrl(value)) return value;
        try {{
            return new URL(value, TARGET_URL).toString();
        }} catch (error) {{
            return '';
        }}
    }}

    function isHttpUrl(rawUrl) {{
        return /^https?:/i.test(String(rawUrl || ''));
    }}

    function toViewUrl(rawUrl) {{
        var absoluteUrl = resolveUrl(rawUrl);
        if (!absoluteUrl || !isHttpUrl(absoluteUrl)) return '';
        return VIEW_PREFIX + encodeURIComponent(absoluteUrl);
    }}

    function toResourceUrl(rawUrl) {{
        var absoluteUrl = resolveUrl(rawUrl);
        if (!absoluteUrl || !isHttpUrl(absoluteUrl)) return '';
        return RESOURCE_PREFIX + encodeURIComponent(absoluteUrl);
    }}

    function isIgnoredLink(rawUrl) {{
        var value = String(rawUrl || '').trim().toLowerCase();
        return !value
            || value.charAt(0) === '#'
            || value.startsWith('javascript:')
            || value.startsWith('mailto:')
            || value.startsWith('tel:')
            || value.startsWith('data:');
    }}

    function navigateToView(rawUrl) {{
        var nextUrl = toViewUrl(rawUrl);
        if (nextUrl) {{
            window.location.href = nextUrl;
            return true;
        }}
        return false;
    }}

    document.addEventListener('click', function (event) {{
        var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (!anchor) return;
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (String(anchor.target || '').toLowerCase() === '_blank') return;

        var href = anchor.getAttribute('href');
        if (isIgnoredLink(href)) return;

        if (navigateToView(href)) {{
            event.preventDefault();
            event.stopPropagation();
        }}
    }}, true);

    document.addEventListener('submit', function (event) {{
        var form = event.target;
        if (!form || String(form.method || 'GET').toUpperCase() !== 'GET') return;

        var action = form.getAttribute('action') || TARGET_URL;
        if (isIgnoredLink(action)) return;

        try {{
            var url = new URL(resolveUrl(action) || TARGET_URL);
            var formData = new FormData(form);
            formData.forEach(function (value, key) {{
                url.searchParams.set(key, value);
            }});

            var nextUrl = toViewUrl(url.toString());
            if (nextUrl) {{
                event.preventDefault();
                event.stopPropagation();
                window.location.href = nextUrl;
            }}
        }} catch (error) {{}}
    }}, true);

    var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
    if (nativeFetch) {{
        window.fetch = function (input, init) {{
            var rawUrl = '';
            var method = 'GET';
            if (typeof input === 'string' || input instanceof URL) {{
                rawUrl = String(input);
            }} else if (input && typeof input.url === 'string') {{
                rawUrl = input.url;
                method = input.method || method;
            }}
            if (init && init.method) method = init.method;

            if (isBridgeUrl(rawUrl)) {{
                return nativeFetch(input, init);
            }}

            var resourceUrl = toResourceUrl(rawUrl);
            if (!resourceUrl) {{
                return nativeFetch(input, init);
            }}

            method = String(method || 'GET').toUpperCase();
            if (method !== 'GET' && method !== 'POST') {{
                return nativeFetch(input, init);
            }}

            var nextInit = Object.assign({{}}, init || {{}});
            nextInit.method = method;
            if (!nextInit.headers && input && input.headers) {{
                nextInit.headers = input.headers;
            }}

            return nativeFetch(resourceUrl, nextInit);
        }};
    }}

    if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {{
        var nativeOpen = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function (method, rawUrl) {{
            var nextUrl = rawUrl;
            if (!isBridgeUrl(rawUrl)) {{
                var resourceUrl = toResourceUrl(rawUrl);
                if (resourceUrl) {{
                    nextUrl = resourceUrl;
                }}
            }}
            var args = Array.prototype.slice.call(arguments);
            args[1] = nextUrl;
            return nativeOpen.apply(this, args);
        }};
    }}

    if (window.EventSource) {{
        var NativeEventSource = window.EventSource;
        window.EventSource = function (rawUrl, config) {{
            var nextUrl = isBridgeUrl(rawUrl) ? String(rawUrl) : (toResourceUrl(rawUrl) || rawUrl);
            return new NativeEventSource(nextUrl, config);
        }};
        window.EventSource.prototype = NativeEventSource.prototype;
    }}

    if (window.WebSocket) {{
        var NativeWebSocket = window.WebSocket;
        window.WebSocket = function (rawUrl, protocols) {{
            var absoluteUrl = resolveUrl(rawUrl);
            if (absoluteUrl) {{
                absoluteUrl = absoluteUrl.replace(/^http/i, 'ws');
            }} else {{
                absoluteUrl = rawUrl;
            }}
            return protocols ? new NativeWebSocket(absoluteUrl, protocols) : new NativeWebSocket(absoluteUrl);
        }};
        window.WebSocket.prototype = NativeWebSocket.prototype;
    }}

    try {{
        var nativePushState = history.pushState.bind(history);
        history.pushState = function (state, title, rawUrl) {{
            if (rawUrl != null) {{
                var viewUrl = toViewUrl(rawUrl);
                if (viewUrl) rawUrl = viewUrl;
            }}
            return nativePushState(state, title, rawUrl);
        }};
    }} catch (error) {{}}

    try {{
        var nativeReplaceState = history.replaceState.bind(history);
        history.replaceState = function (state, title, rawUrl) {{
            if (rawUrl != null) {{
                var viewUrl = toViewUrl(rawUrl);
                if (viewUrl) rawUrl = viewUrl;
            }}
            return nativeReplaceState(state, title, rawUrl);
        }};
    }} catch (error) {{}}

    try {{
        var nativeAssign = window.location.assign.bind(window.location);
        window.location.assign = function (rawUrl) {{
            var viewUrl = toViewUrl(rawUrl);
            return nativeAssign(viewUrl || rawUrl);
        }};
    }} catch (error) {{}}

    try {{
        var nativeReplace = window.location.replace.bind(window.location);
        window.location.replace = function (rawUrl) {{
            var viewUrl = toViewUrl(rawUrl);
            return nativeReplace(viewUrl || rawUrl);
        }};
    }} catch (error) {{}}

    if (navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {{
        try {{
            navigator.serviceWorker.register = function () {{
                return Promise.reject(new Error('Service workers are disabled inside the EveOS popup bridge.'));
            }};
        }} catch (error) {{}}
    }}

    window.__EVEOS_POPUP_BRIDGE__ = {{
        targetUrl: TARGET_URL,
        viewPrefix: VIEW_PREFIX,
        resourcePrefix: RESOURCE_PREFIX
    }};
}})();
</script>
""".strip()


def build_popup_document(target_url, raw_html):
    page_url = str(target_url or "").strip()
    html_text = str(raw_html or "").strip()
    if not html_text:
        html_text = "<!doctype html><html><head></head><body></body></html>"

    clean_html = _CSP_META_RE.sub("", html_text)
    clean_html = _META_REFRESH_RE.sub("", clean_html)
    clean_html = _BASE_TAG_RE.sub("", clean_html)

    base_tag = f'<base href="{html.escape(page_url, quote=True)}">'
    inject_block = (
        '<meta name="referrer" content="no-referrer">'
        + base_tag
        + _bridge_shim(page_url)
    )

    if _HEAD_TAG_RE.search(clean_html):
        return _HEAD_TAG_RE.sub(lambda match: f"<head{match.group(1)}>{inject_block}", clean_html, count=1)

    return f"<!doctype html><html><head>{inject_block}</head><body>{clean_html}</body></html>"


def _build_fallback_document(target_url, message):
    safe_target = html.escape(str(target_url or ""), quote=True)
    safe_message = html.escape(str(message or "Unable to load this page in the EveOS popup bridge."))
    return f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Popup Bridge Fallback</title>
    <style>
        html, body {{
            margin: 0;
            min-height: 100%;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #0f1720;
            color: #f5f7fa;
        }}
        .shell {{
            max-width: 760px;
            margin: 6vh auto;
            padding: 24px;
        }}
        .card {{
            background: rgba(15, 23, 32, 0.92);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
        }}
        h1 {{
            margin: 0 0 12px 0;
            font-size: 1.25rem;
        }}
        p {{
            line-height: 1.5;
            margin: 0 0 12px 0;
            color: rgba(245, 247, 250, 0.82);
        }}
        code {{
            display: block;
            margin: 14px 0;
            padding: 12px 14px;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.06);
            overflow-wrap: anywhere;
        }}
        a {{
            color: #8ec5ff;
        }}
    </style>
</head>
<body>
    <div class="shell">
        <div class="card">
            <h1>Popup View Unavailable</h1>
            <p>{safe_message}</p>
            <code>{safe_target}</code>
            <p><a href="{safe_target}" target="_blank" rel="noopener noreferrer">Open this page in a new tab</a></p>
        </div>
    </div>
</body>
</html>"""


def _send_html(handler, html_text, status=HTTPStatus.OK):
    body = str(html_text or "").encode("utf-8", errors="replace")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.end_headers()
    handler.wfile.write(body)


def _send_json_error(handler, status, message, target_url=""):
    payload = json.dumps({
        "error": message,
        "url": str(target_url or "").strip(),
    }).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(payload)


def handle_popup_view(handler, query):
    target_url = str((query.get("url") or [""])[0] or "").strip()
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
        popup_document = build_popup_document(final_url, raw_html)
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
    target_url = str((query.get("url") or [""])[0] or "").strip()
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
