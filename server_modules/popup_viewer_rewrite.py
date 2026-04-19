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
