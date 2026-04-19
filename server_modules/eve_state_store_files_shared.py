import hashlib
import json
import logging
import re
import time
from pathlib import Path


logger = logging.getLogger("FandomDiscoveryServer")


def slugify(value, fallback="item"):
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or fallback


def short_hash(value, length=6):
    size = max(1, int(length or 6))
    return hashlib.sha1(str(value or "").encode("utf-8")).hexdigest()[:size]


def safe_filename(value, fallback):
    text = str(value or "").strip()
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", text)
    text = text.strip(" .")
    return text or fallback


def clean_name_segment(value, fallback, max_length):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = safe_filename(text, fallback)
    if len(text) > max_length:
        text = text[:max_length].rstrip(" .-_")
    return text or fallback


def folder_name(label, fallback):
    slug = clean_name_segment(slugify(label, fallback), fallback, 20)
    return f"{slug}--{short_hash(label, 6)}"


def parse_scoped_category_key(key):
    raw = str(key or "")
    if "::" not in raw:
        return {
            "workspace_id": "",
            "category_name": raw.strip() or "Unsorted",
        }
    workspace_id, category_name = raw.split("::", 1)
    return {
        "workspace_id": workspace_id.strip(),
        "category_name": category_name.strip() or "Unsorted",
    }


def scoped_key(workspace_id, category_name):
    ws = str(workspace_id or "").strip() or "main"
    cat = str(category_name or "").strip() or "Unsorted"
    return f"{ws}::{cat}"


def extract_bookmark_dict(payload):
    if not isinstance(payload, dict):
        return {}
    bookmark = payload.get("bookmark")
    if isinstance(bookmark, dict):
        return bookmark
    return payload


def read_bookmark_id_from_file(path):
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return ""
    bookmark = extract_bookmark_dict(payload)
    return str((bookmark or {}).get("id") or "").strip()


def build_bookmark_filename(bookmark, category_name=""):
    item = bookmark or {}
    link_id_raw = str(item.get("id") or "").strip() or "bookmark"
    title_raw = str(item.get("title") or "").strip() or "untitled"
    url_raw = str(item.get("url") or "").strip()
    link_part = clean_name_segment(link_id_raw, "bookmark", 12)
    title_part = clean_name_segment(title_raw, "untitled", 14)
    file_hash = short_hash(f"{link_id_raw}::{title_raw}::{url_raw}::{category_name}", 8)
    base_name = f"{link_part}--{title_part}--{file_hash}.json"
    fallback = f"{link_part}--{file_hash}.json"
    return safe_filename(base_name, fallback)


def normalize_bookmark_filename(path, bookmark, category_name=""):
    expected_name = build_bookmark_filename(bookmark, category_name=category_name)
    if path.name == expected_name:
        return path

    target = path.with_name(expected_name)
    if target.exists() and target != path:
        source_link_id = str((bookmark or {}).get("id") or "").strip()
        target_link_id = read_bookmark_id_from_file(target)
        if source_link_id and source_link_id == target_link_id:
            try:
                path.unlink()
                logger.info(
                    "Removed duplicate bookmark file after canonical match: %s (kept %s)",
                    path.name,
                    target.name,
                )
                return target
            except Exception:
                logger.warning(
                    "Failed to remove duplicate bookmark file '%s' while keeping '%s'",
                    path,
                    target,
                )
        suffix_hash = hashlib.sha1(str(path).encode("utf-8")).hexdigest()[:6]
        stem = target.stem
        suffix = target.suffix
        target = path.with_name(safe_filename(f"{stem}--{suffix_hash}{suffix}", path.name))

    try:
        path.rename(target)
        logger.info("Renamed bookmark file to canonical name: %s -> %s", path.name, target.name)
        return target
    except Exception:
        logger.warning("Failed to rename bookmark file '%s' to '%s'", path, target)
        return path


def connection_category_name(conn):
    return (
        conn.get("categoryName")
        or conn.get("category")
        or conn.get("libraryCategory")
        or "Unsorted"
    )


def connection_entry_id(conn):
    return conn.get("libraryEntryId") or conn.get("entryId")


def load_json_file(path, fallback=None):
    default = fallback if fallback is not None else {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def paths_equal(left, right):
    try:
        left_resolved = str(Path(left).resolve()).lower()
        right_resolved = str(Path(right).resolve()).lower()
        return left_resolved == right_resolved
    except Exception:
        return str(left).lower() == str(right).lower()


def resolve_card_category_name(card_data, fallback_name):
    if not isinstance(card_data, dict):
        card_data = {}
    for key in ("categoryName", "name", "title"):
        candidate = str(card_data.get(key) or "").strip()
        if candidate:
            return candidate
    fallback = str(fallback_name or "").strip()
    return fallback or "Unsorted"


def unique_move_candidate(source_file, target_folder):
    suffix_hash = hashlib.sha1(str(source_file).encode("utf-8")).hexdigest()[:6]
    stem = source_file.stem
    suffix = source_file.suffix
    candidate = target_folder / safe_filename(f"{stem}--{suffix_hash}{suffix}", source_file.name)
    if candidate.exists():
        suffix_hash = hashlib.sha1(f"{source_file}-{time.time_ns()}".encode("utf-8")).hexdigest()[:8]
        candidate = target_folder / safe_filename(f"{stem}--{suffix_hash}{suffix}", source_file.name)
    return candidate
