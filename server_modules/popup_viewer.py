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
_TAG_OPEN_RE = re.compile(r"<(?P<tag>[a-zA-Z][\w:-]*)(?P<attrs>(?:\s+[^<>]*?)?)>", re.I | re.S)
_STYLE_BLOCK_RE = re.compile(r"(<style\b[^>]*>)(?P<css>.*?)(</style>)", re.I | re.S)
_STYLE_URL_RE = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I | re.S)
_STYLE_IMPORT_RE = re.compile(r"@import\s+(?:url\(\s*)?(['\"])(.*?)\1\s*\)?", re.I | re.S)
_RESOURCE_ATTRS_BY_TAG = {
    "audio": ("src",),
    "embed": ("src",),
    "iframe": ("src",),
    "img": ("src", "srcset"),
    "input": ("src", "formaction"),
    "link": ("href",),
    "object": ("data",),
    "script": ("src",),
    "source": ("src", "srcset"),
    "track": ("src",),
    "video": ("src", "poster"),
}
_RESOURCE_REL_TOKENS = {
    "apple-touch-icon",
    "icon",
    "manifest",
    "modulepreload",
    "prefetch",
    "preload",
    "stylesheet",
}
_RESOURCE_AS_TOKENS = {"fetch", "font", "image", "script", "style"}
_REMOVABLE_RESOURCE_ATTRS = ("crossorigin", "integrity")


def _popup_proxy_path(target_url, mode, bridge_base=""):
    normalized_url = str(target_url or "").strip()
    normalized_mode = "view" if str(mode or "").strip().lower() == "view" else "resource"
    if not normalized_url:
        return ""

    try:
        parsed = urllib.parse.urlparse(normalized_url)
    except Exception:
        return ""

    scheme = str(parsed.scheme or "").strip().lower()
    netloc = str(parsed.netloc or "").strip()
    if scheme not in ("http", "https") or not netloc:
        return ""

    raw_path = parsed.path or "/"
    safe_path = urllib.parse.quote(
        urllib.parse.unquote(raw_path if raw_path.startswith("/") else f"/{raw_path}"),
        safe="/:@!$&'()*+,;=-._~%",
    )
    proxy_path = f"/api/popup-{normalized_mode}/{scheme}/{netloc}{safe_path}"
    if parsed.query:
        proxy_path += f"?{parsed.query}"
    normalized_bridge = str(bridge_base or "").strip().rstrip("/")
    return f"{normalized_bridge}{proxy_path}" if normalized_bridge else proxy_path


def _parse_popup_proxy_url(raw_url):
    value = str(raw_url or "").strip()
    if not value:
        return "", ""

    try:
        parsed = urllib.parse.urlparse(value)
    except Exception:
        return "", ""

    path = str(parsed.path or "").strip()
    if not path:
        return "", ""

    for candidate_mode in ("view", "resource"):
        base_path = f"/api/popup-{candidate_mode}"
        prefix = f"{base_path}/"

        if path == base_path:
            query = urllib.parse.parse_qs(parsed.query or "", keep_blank_values=True)
            target_url = str((query.get("url") or [""])[0] or "").strip()
            return candidate_mode, target_url

        if not path.startswith(prefix):
            continue

        remainder = path[len(prefix):].lstrip("/")
        parts = remainder.split("/", 2)
        if len(parts) < 2:
            return "", ""

        scheme = urllib.parse.unquote(parts[0]).strip().lower()
        netloc = urllib.parse.unquote(parts[1]).strip()
        raw_path = urllib.parse.unquote(f"/{parts[2]}" if len(parts) > 2 else "/")
        if scheme not in ("http", "https") or not netloc:
            return "", ""

        target_url = urllib.parse.urlunparse((scheme, netloc, raw_path, "", parsed.query, ""))
        return candidate_mode, target_url

    return "", ""


def _extract_target_url(handler, query, mode):
    requested_mode = "view" if str(mode or "").strip().lower() == "view" else "resource"
    parsed_mode, target_url = _parse_popup_proxy_url(str(getattr(handler, "path", "") or ""))
    if parsed_mode == requested_mode and target_url:
        return target_url

    if parsed_mode == requested_mode:
        return ""

    target_url = str((query.get("url") or [""])[0] or "").strip()
    return target_url


def _resolve_popup_asset_url(page_url, raw_url, mode="resource", bridge_base=""):
    value = str(raw_url or "").strip()
    if not value:
        return ""

    lowered = value.lower()
    if (
        lowered.startswith("#")
        or lowered.startswith("javascript:")
        or lowered.startswith("mailto:")
        or lowered.startswith("tel:")
        or lowered.startswith("data:")
    ):
        return ""

    existing_mode, existing_target_url = _parse_popup_proxy_url(value)
    if existing_target_url:
        normalized_mode = mode or existing_mode
        return _popup_proxy_path(existing_target_url, normalized_mode, bridge_base=bridge_base) or value

    try:
        absolute_url = urllib.parse.urljoin(str(page_url or "").strip(), value)
    except Exception:
        return ""

    existing_mode, existing_target_url = _parse_popup_proxy_url(absolute_url)
    if existing_target_url:
        normalized_mode = mode or existing_mode
        return _popup_proxy_path(existing_target_url, normalized_mode, bridge_base=bridge_base) or absolute_url

    return _popup_proxy_path(absolute_url, mode, bridge_base=bridge_base)


def _rewrite_srcset(value, page_url, bridge_base=""):
    entries = []
    for part in str(value or "").split(","):
        chunk = str(part or "").strip()
        if not chunk:
            continue
        tokens = chunk.split()
        source_url = tokens[0]
        descriptor = " ".join(tokens[1:])
        rewritten = _resolve_popup_asset_url(page_url, source_url, mode="resource", bridge_base=bridge_base) or source_url
        entries.append(f"{rewritten} {descriptor}".strip())
    return ", ".join(entries)


def _rewrite_css_urls(css_text, page_url, bridge_base=""):
    source = str(css_text or "")

    def rewrite_url(match):
        quote = match.group(1) or ""
        raw_url = match.group(2)
        rewritten = _resolve_popup_asset_url(page_url, raw_url, mode="resource", bridge_base=bridge_base)
        if not rewritten:
            return match.group(0)
        return f"url({quote}{rewritten}{quote})"

    def rewrite_import(match):
        quote = match.group(1)
        raw_url = match.group(2)
        rewritten = _resolve_popup_asset_url(page_url, raw_url, mode="resource", bridge_base=bridge_base)
        if not rewritten:
            return match.group(0)
        return f'@import "{rewritten}"'

    source = _STYLE_URL_RE.sub(rewrite_url, source)
    source = _STYLE_IMPORT_RE.sub(rewrite_import, source)
    return source


def _remove_tag_attribute(attrs_text, attribute_name):
    return re.sub(
        rf"\s+\b{re.escape(attribute_name)}\b(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+))?",
        "",
        str(attrs_text or ""),
        flags=re.I | re.S,
    )


def _extract_attr_value(attrs_text, attribute_name):
    match = re.search(
        rf"\b{re.escape(attribute_name)}\s*=\s*(?:\"([^\"]*)\"|'([^']*)')",
        str(attrs_text or ""),
        flags=re.I | re.S,
    )
    if not match:
        return ""
    return match.group(1) if match.group(1) is not None else match.group(2) or ""


def _replace_attr_value(attrs_text, attribute_name, transform):
    pattern = re.compile(
        rf"(\b{re.escape(attribute_name)}\s*=\s*)(\"([^\"]*)\"|'([^']*)')",
        flags=re.I | re.S,
    )

    def repl(match):
        raw_value = match.group(3) if match.group(3) is not None else match.group(4) or ""
        rewritten = transform(raw_value)
        if not rewritten or rewritten == raw_value:
            return match.group(0)
        quote = '"' if match.group(3) is not None else "'"
        return f"{match.group(1)}{quote}{html.escape(rewritten, quote=True)}{quote}"

    return pattern.sub(repl, str(attrs_text or ""))


def _should_rewrite_link(attrs_text):
    rel_value = _extract_attr_value(attrs_text, "rel").lower()
    as_value = _extract_attr_value(attrs_text, "as").lower()
    rel_tokens = {token.strip() for token in rel_value.split() if token.strip()}
    if rel_tokens & _RESOURCE_REL_TOKENS:
        return True
    return as_value in _RESOURCE_AS_TOKENS


def _rewrite_popup_resource_tags(page_url, html_text, bridge_base=""):
    source = str(html_text or "")

    def rewrite_tag(match):
        tag_name = str(match.group("tag") or "").lower()
        attrs = str(match.group("attrs") or "")
        if not tag_name or not attrs:
            return match.group(0)

        if tag_name == "link" and not _should_rewrite_link(attrs):
            return match.group(0)

        attr_names = _RESOURCE_ATTRS_BY_TAG.get(tag_name, ())
        rewritten_attrs = attrs
        for attr_name in attr_names:
            if attr_name == "srcset":
                rewritten_attrs = _replace_attr_value(
                    rewritten_attrs,
                    attr_name,
                    lambda current: _rewrite_srcset(current, page_url, bridge_base=bridge_base),
                )
                continue

            rewritten_attrs = _replace_attr_value(
                rewritten_attrs,
                attr_name,
                lambda current: _resolve_popup_asset_url(page_url, current, mode="resource", bridge_base=bridge_base),
            )

        if "style=" in rewritten_attrs.lower():
            rewritten_attrs = _replace_attr_value(
                rewritten_attrs,
                "style",
                lambda current: _rewrite_css_urls(current, page_url, bridge_base=bridge_base),
            )

        if tag_name in _RESOURCE_ATTRS_BY_TAG:
            for attr_name in _REMOVABLE_RESOURCE_ATTRS:
                rewritten_attrs = _remove_tag_attribute(rewritten_attrs, attr_name)

        return f"<{match.group('tag')}{rewritten_attrs}>"

    source = _TAG_OPEN_RE.sub(rewrite_tag, source)
    source = _STYLE_BLOCK_RE.sub(
        lambda match: f"{match.group(1)}{_rewrite_css_urls(match.group('css'), page_url, bridge_base=bridge_base)}{match.group(3)}",
        source,
    )
    return source


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
    var VIEW_PREFIX = window.location.origin + '/api/popup-view/';
    var RESOURCE_PREFIX = window.location.origin + '/api/popup-resource/';

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
        return /^\\/api\\/popup-(?:view|resource)(?:\\/|\\?url=)/i.test(value)
            || /^https?:\\/\\/(127\\.0\\.0\\.1|localhost)(:\\d+)?\\/api\\/popup-(?:view|resource)(?:\\/|\\?url=)/i.test(value);
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

    function proxyPathForUrl(rawUrl, mode) {{
        var absoluteUrl = resolveUrl(rawUrl);
        if (isBridgeUrl(absoluteUrl)) return absoluteUrl;
        if (!absoluteUrl || !isHttpUrl(absoluteUrl)) return '';
        try {{
            var parsed = new URL(absoluteUrl);
            var prefix = String(mode || 'resource').toLowerCase() === 'view' ? VIEW_PREFIX : RESOURCE_PREFIX;
            var pathname = parsed.pathname || '/';
            var query = parsed.search || '';
            var hash = String(mode || 'resource').toLowerCase() === 'view' ? (parsed.hash || '') : '';
            return prefix + parsed.protocol.replace(':', '') + '/' + parsed.host + pathname + query + hash;
        }} catch (error) {{
            return '';
        }}
    }}

    function toViewUrl(rawUrl) {{
        return proxyPathForUrl(rawUrl, 'view');
    }}

    function toResourceUrl(rawUrl) {{
        return proxyPathForUrl(rawUrl, 'resource');
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

    function shouldRewriteLink(node) {{
        if (!node || !node.getAttribute) return false;
        var relValue = String(node.getAttribute('rel') || '').toLowerCase();
        var asValue = String(node.getAttribute('as') || '').toLowerCase();
        var relTokens = relValue.split(/\\s+/).filter(Boolean);
        return relTokens.some(function (token) {{
            return token === 'stylesheet'
                || token === 'modulepreload'
                || token === 'preload'
                || token === 'prefetch'
                || token === 'icon'
                || token === 'apple-touch-icon'
                || token === 'manifest';
        }}) || ['fetch', 'font', 'image', 'script', 'style'].indexOf(asValue) !== -1;
    }}

    function rewriteSrcsetValue(rawValue) {{
        return String(rawValue || '')
            .split(',')
            .map(function (part) {{
                var chunk = String(part || '').trim();
                if (!chunk) return '';
                var tokens = chunk.split(/\\s+/);
                var rewritten = toResourceUrl(tokens[0]) || tokens[0];
                return [rewritten].concat(tokens.slice(1)).join(' ').trim();
            }})
            .filter(Boolean)
            .join(', ');
    }}

    function rewriteCssUrls(rawValue) {{
        return String(rawValue || '').replace(/url\\(\\s*(['\"]?)(.*?)\\1\\s*\\)/gi, function (fullMatch, quote, resourceUrl) {{
            var rewritten = toResourceUrl(resourceUrl);
            if (!rewritten) return fullMatch;
            return 'url(' + (quote || '') + rewritten + (quote || '') + ')';
        }});
    }}

    function rewriteAttribute(node, attributeName, rewriteFn) {{
        if (!node || !node.hasAttribute || !node.hasAttribute(attributeName)) return;
        var currentValue = node.getAttribute(attributeName);
        var rewritten = rewriteFn(currentValue);
        if (!rewritten || rewritten === currentValue) return;
        node.setAttribute(attributeName, rewritten);
    }}

    function rewriteElement(node) {{
        if (!node || node.nodeType !== 1 || !node.tagName) return;
        var tagName = String(node.tagName).toLowerCase();

        if (tagName === 'script') {{
            rewriteAttribute(node, 'src', function (value) {{ return toResourceUrl(value); }});
        }}
        if (tagName === 'link' && shouldRewriteLink(node)) {{
            rewriteAttribute(node, 'href', function (value) {{ return toResourceUrl(value); }});
        }}
        if (['img', 'source', 'iframe', 'embed', 'track', 'audio', 'video'].indexOf(tagName) !== -1) {{
            rewriteAttribute(node, 'src', function (value) {{ return toResourceUrl(value); }});
        }}
        if (tagName === 'video') {{
            rewriteAttribute(node, 'poster', function (value) {{ return toResourceUrl(value); }});
        }}
        if (tagName === 'object') {{
            rewriteAttribute(node, 'data', function (value) {{ return toResourceUrl(value); }});
        }}
        if (tagName === 'input') {{
            rewriteAttribute(node, 'src', function (value) {{ return toResourceUrl(value); }});
            rewriteAttribute(node, 'formaction', function (value) {{ return toViewUrl(value); }});
        }}
        if (tagName === 'img' || tagName === 'source') {{
            rewriteAttribute(node, 'srcset', rewriteSrcsetValue);
        }}
        rewriteAttribute(node, 'style', rewriteCssUrls);

        if (['script', 'link', 'img', 'source', 'video', 'audio', 'iframe', 'embed', 'object', 'track'].indexOf(tagName) !== -1) {{
            node.removeAttribute('crossorigin');
            node.removeAttribute('integrity');
        }}
    }}

    function rewriteTree(root) {{
        if (!root || root.nodeType !== 1) return;
        rewriteElement(root);
        if (!root.querySelectorAll) return;
        root.querySelectorAll('*').forEach(rewriteElement);
    }}

    try {{
        var nativeAppendChild = Node.prototype.appendChild;
        Node.prototype.appendChild = function (child) {{
            rewriteTree(child);
            return nativeAppendChild.call(this, child);
        }};
    }} catch (error) {{}}

    try {{
        var nativeInsertBefore = Node.prototype.insertBefore;
        Node.prototype.insertBefore = function (newNode, referenceNode) {{
            rewriteTree(newNode);
            return nativeInsertBefore.call(this, newNode, referenceNode);
        }};
    }} catch (error) {{}}

    try {{
        var nativeReplaceChild = Node.prototype.replaceChild;
        Node.prototype.replaceChild = function (newChild, oldChild) {{
            rewriteTree(newChild);
            return nativeReplaceChild.call(this, newChild, oldChild);
        }};
    }} catch (error) {{}}

    try {{
        rewriteTree(document.documentElement);
        var observer = new MutationObserver(function (records) {{
            records.forEach(function (record) {{
                if (record.type === 'attributes') {{
                    rewriteElement(record.target);
                    return;
                }}
                record.addedNodes.forEach(function (node) {{
                    rewriteTree(node);
                }});
            }});
        }});
        observer.observe(document.documentElement || document, {{
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'href', 'srcset', 'style', 'poster', 'data', 'formaction', 'crossorigin', 'integrity']
        }});
    }} catch (error) {{}}

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


def build_popup_document(target_url, raw_html, bridge_base=""):
    page_url = str(target_url or "").strip()
    html_text = str(raw_html or "").strip()
    if not html_text:
        html_text = "<!doctype html><html><head></head><body></body></html>"

    clean_html = _CSP_META_RE.sub("", html_text)
    clean_html = _META_REFRESH_RE.sub("", clean_html)
    clean_html = _BASE_TAG_RE.sub("", clean_html)
    clean_html = _rewrite_popup_resource_tags(page_url, clean_html, bridge_base=bridge_base)

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
