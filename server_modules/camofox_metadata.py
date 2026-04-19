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

BLOCKED_TITLE_TOKENS = (
    "just a moment",
    "attention required! | cloudflare",
    "access denied",
    "verify you are human",
    "checking your browser",
    "enable javascript and cookies",
    "captcha",
    "too many requests",
)

def _looks_blocked_text(value):
    text = str(value or "").strip().lower()
    if not text:
        return False
    return any(token in text for token in BLOCKED_TITLE_TOKENS)

def _clean_title(raw):
    title = re.sub(r"\s+", " ", str(raw or "")).strip()
    if not title:
        return None
    if _looks_blocked_text(title):
        return "CLOUDFLARE_BLOCK"
    return title

def _looks_generic_title(title, target_url):
    cleaned = str(title or "").strip()
    if not cleaned:
        return True
    if cleaned == "CLOUDFLARE_BLOCK":
        return False
    lowered = cleaned.lower()
    if lowered in {"home", "welcome", "index", "untitled", "loading"}:
        return True
    parsed = urlparse(target_url)
    hostname = (parsed.hostname or "").lower()
    if hostname and lowered in {hostname, hostname.replace("www.", "")}:
        return True
    slug = str(parsed.path or "").strip("/").split("/")[-1].lower()
    if slug and lowered == slug:
        return True
    return False

def _extract_title_from_snapshot(snapshot_text, target_url):
    lines = str(snapshot_text or "").splitlines()
    candidates = []

    role_scores = {
        "heading": 90,
        "document": 80,
        "main": 40,
        "paragraph": 52,
        "text": 28,
    }

    def _extract_role_value(line, role):
        quoted_match = re.search(rf'^\s*-\s+{role}\s+"([^"]+)"', line, re.IGNORECASE)
        if quoted_match:
            return quoted_match.group(1)
        colon_match = re.search(rf'^\s*-\s+{role}\s*:\s*(.+)$', line, re.IGNORECASE)
        if colon_match:
            return colon_match.group(1)
        return None

    reject_tokens = ("logo", "flag icon", "script icon", "ctrl k", "search", "home", "feed", "community", "compliance")

    for index, line in enumerate(lines[:220]):
        for role, base_score in role_scores.items():
            raw_value = _extract_role_value(line, role)
            if not raw_value:
                continue
            candidate = _clean_title(raw_value)
            if not candidate:
                continue
            lowered = candidate.lower()
            if any(token in lowered for token in reject_tokens):
                continue
            if len(candidate) > 180:
                continue
            score = base_score + len(candidate)
            if index < 25:
                score += 30
            elif index < 80:
                score += 15
            if not _looks_generic_title(candidate, target_url):
                score += 25
            if role == "paragraph" and len(candidate) >= 4:
                score += 20
            candidates.append((score, candidate))
            break

    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]

def _extract_description_from_snapshot(snapshot_text, title):
    lines = str(snapshot_text or "").splitlines()
    cleaned_title = str(title or "").strip()
    for line in lines[:140]:
        lowered = line.lower()
        if any(token in lowered for token in (' link "', ' button "', ' searchbox "', ' textbox "', ' checkbox "', ' navigation', ' menuitem "')):
            continue
        match = re.search(r'"([^"]+)"', line)
        if match:
            text = re.sub(r"\s+", " ", match.group(1)).strip()
        else:
            colon_match = re.search(r'^\s*-\s+(?:paragraph|text)\s*:\s*(.+)$', line, re.IGNORECASE)
            if not colon_match:
                continue
            text = re.sub(r"\s+", " ", colon_match.group(1)).strip()
        if len(text) < 40:
            continue
        if cleaned_title and text == cleaned_title:
            continue
        return text[:500]
    return None

def _title_tokens(value):
    tokens = []
    for token in re.findall(r"[a-z0-9]+", str(value or "").lower()):
        if len(token) < 4:
            continue
        if token in {"with", "from", "that", "this", "your", "have", "will", "into", "only", "video", "videos", "porn", "com"}:
            continue
        tokens.append(token)
    return tokens

def _score_title_overlap(text, page_title):
    candidate_tokens = set(_title_tokens(text))
    page_tokens = set(_title_tokens(page_title))
    if not candidate_tokens or not page_tokens:
        return 0
    overlap = candidate_tokens.intersection(page_tokens)
    if not overlap:
        return 0
    ratio = len(overlap) / max(1, min(len(candidate_tokens), len(page_tokens)))
    return min(80, int(len(overlap) * 10 + ratio * 40))

def _score_image_candidate(item, target_url, page_title=None):
    src = str((item or {}).get("src") or (item or {}).get("url") or "").strip()
    if not src:
        return -999
    lowered = src.lower()
    alt = re.sub(r"\s+", " ", str((item or {}).get("alt") or "")).strip()
    alt_lower = alt.lower()
    width = int((item or {}).get("width") or 0)
    height = int((item or {}).get("height") or 0)
    area = max(0, width) * max(0, height)
    candidate_source = str((item or {}).get("source") or "").strip().lower()
    candidate_class = str((item or {}).get("className") or "").strip().lower()
    candidate_id = str((item or {}).get("id") or "").strip().lower()
    candidate_title = re.sub(r"\s+", " ", str((item or {}).get("title") or "")).strip()

    reject_tokens = ("logo", "icon", "favicon", "avatar", "sprite", "badge", "emoji", "pixel", "banner")
    if any(
        token in lowered
        or token in alt_lower
        or token in candidate_class
        or token in candidate_id
        for token in reject_tokens
    ):
        return -250

    score = 0
    if candidate_source == "video_poster":
        score += 220
    elif candidate_source in {"og_image", "twitter_image", "jsonld_image"}:
        score += 180
    elif candidate_source in {"hero_image", "content_image"}:
        score += 110

    if area >= 300000:
        score += 130
    elif area >= 120000:
        score += 100
    elif area >= 60000:
        score += 75
    elif area >= 25000:
        score += 35

    if width >= 220 and height >= 220:
        score += 35
    elif width and height and (width < 80 or height < 80):
        score -= 70

    if alt:
        score += min(18, max(6, len(alt) // 8))
    if candidate_title:
        score += min(12, max(4, len(candidate_title) // 10))

    positive_tokens = ("cover", "poster", "thumb", "thumbnail", "preview", "gallery", "doujin", "manga", "comic", "image", "photo")
    if any(
        token in lowered
        or token in alt_lower
        or token in candidate_class
        or token in candidate_id
        for token in positive_tokens
    ):
        score += 18

    if lowered.endswith(".svg"):
        score -= 80

    if candidate_source not in {"video_poster", "og_image", "twitter_image", "jsonld_image"}:
        noisy_tokens = ("related", "recommended", "sidebar", "widget", "latest", "archive", "category")
        if any(
            token in lowered
            or token in alt_lower
            or token in candidate_class
            or token in candidate_id
            for token in noisy_tokens
        ):
            score -= 50

    overlap_text = " ".join(part for part in (alt, candidate_title) if part).strip()
    score += _score_title_overlap(overlap_text, page_title)

    try:
        target_host = (urlparse(target_url).hostname or "").lower()
        image_host = (urlparse(src).hostname or "").lower()
        if target_host and image_host and target_host == image_host:
            score += 10
    except Exception:
        pass

    return score

def _pick_cover(images, target_url, page_title=None, dom_candidates=None):
    best_src = None
    best_score = -999
    seen = set()
    merged_candidates = []
    for item in dom_candidates or []:
        if not isinstance(item, dict):
            continue
        merged_candidates.append(item)
    for item in images or []:
        if not isinstance(item, dict):
            continue
        merged_candidates.append(item)
    for item in merged_candidates:
        src = str((item or {}).get("src") or (item or {}).get("url") or "").strip()
        if not src:
            continue
        comparable = src.lower()
        if comparable in seen:
            continue
        seen.add(comparable)
        score = _score_image_candidate(item, target_url, page_title=page_title)
        if score > best_score:
            best_score = score
            best_src = src
    if best_score < 0:
        return None
    return best_src

def _pick_icon(images):
    best = None
    best_area = None
    for item in images or []:
        src = str((item or {}).get("src") or "").strip()
        if not src:
            continue
        width = int((item or {}).get("width") or 0)
        height = int((item or {}).get("height") or 0)
        area = max(0, width) * max(0, height)
        lowered = src.lower()
        if area <= 0 or area > 16384:
            continue
        if "icon" not in lowered and "favicon" not in lowered:
            continue
        if best_area is None or area > best_area:
            best_area = area
            best = src
    return best

def _build_metadata_from_snapshot(target_url, snapshot_text, images, page_url, dom_metadata=None):
    blocked = _looks_blocked_text(snapshot_text)
    dom_metadata = dom_metadata if isinstance(dom_metadata, dict) else {}
    snapshot_title = _extract_title_from_snapshot(snapshot_text, target_url)
    dom_title = _clean_title(dom_metadata.get("title"))
    title = snapshot_title
    if (not title or _looks_generic_title(title, target_url)) and dom_title and not _looks_generic_title(dom_title, target_url):
        title = dom_title
    elif not title and dom_title:
        title = dom_title
    if blocked and (not title or title != "CLOUDFLARE_BLOCK"):
        title = "CLOUDFLARE_BLOCK"

    metadata = {
        "title": title,
        "description": str(dom_metadata.get("description") or "").strip() or _extract_description_from_snapshot(snapshot_text, title),
        "icon": str(dom_metadata.get("icon") or "").strip() or _pick_icon(images),
        "coverUrl": _pick_cover(images, target_url, page_title=title or dom_title, dom_candidates=dom_metadata.get("coverCandidates")),
        "canonicalUrl": str(dom_metadata.get("canonicalUrl") or "").strip() or page_url or target_url,
        "quickLinks": [],
        "source": "Camofox",
    }
    metadata["blocked"] = bool(metadata.get("title") == "CLOUDFLARE_BLOCK" or blocked)
    metadata["genericTitle"] = _looks_generic_title(metadata.get("title"), target_url)
    metadata["quality"] = {
        "hasTitle": bool(metadata.get("title")),
        "blocked": metadata["blocked"],
        "genericTitle": metadata["genericTitle"],
        "hasCover": bool(metadata.get("coverUrl")),
        "hasDescription": bool(metadata.get("description")),
        "quickLinkCount": 0,
    }
    return metadata
