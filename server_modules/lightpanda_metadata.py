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

from server_modules.lightpanda_shared import BLOCKED_TITLE_TOKENS

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
