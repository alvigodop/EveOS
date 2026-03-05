import hashlib
import json
import logging
import re
import shutil
import time
from pathlib import Path


logger = logging.getLogger("FandomDiscoveryServer")


def slugify(value, fallback="item"):
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or fallback


def folder_name(label, fallback):
    slug = slugify(label, fallback)
    short_hash = hashlib.sha1(str(label or "").encode("utf-8")).hexdigest()[:6]
    return f"{slug}--{short_hash}"


def parse_scoped_category_key(key):
    raw = str(key or "")
    if "::" not in raw:
        return {
            "workspace_id": "",
            "category_name": raw.strip() or "Unsorted"
        }
    workspace_id, category_name = raw.split("::", 1)
    return {
        "workspace_id": workspace_id.strip(),
        "category_name": category_name.strip() or "Unsorted"
    }


def scoped_key(workspace_id, category_name):
    ws = str(workspace_id or "").strip() or "main"
    cat = str(category_name or "").strip() or "Unsorted"
    return f"{ws}::{cat}"


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
    link_part = clean_name_segment(link_id_raw, "bookmark", 40)
    card_part = clean_name_segment(category_name, "uncategorized", 60)
    title_part = clean_name_segment(item.get("title"), "untitled", 80)
    base_name = f"{link_part}--{card_part}--{title_part}.json"
    fallback = f"{link_part}.json"
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
                    target.name
                )
                return target
            except Exception:
                logger.warning(
                    "Failed to remove duplicate bookmark file '%s' while keeping '%s'",
                    path,
                    target
                )
        short_hash = hashlib.sha1(str(path).encode("utf-8")).hexdigest()[:6]
        stem = target.stem
        suffix = target.suffix
        target = path.with_name(safe_filename(f"{stem}--{short_hash}{suffix}", path.name))

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


def build_library_index(categories):
    by_scope = {}
    for key, data in (categories or {}).items():
        parsed = parse_scoped_category_key(key)
        scoped = scoped_key(parsed["workspace_id"] or "main", parsed["category_name"])
        entries = (data or {}).get("entries") or []
        entry_map = {}
        for entry in entries:
            entry_id = str((entry or {}).get("id") or "").strip()
            if entry_id:
                entry_map[entry_id] = entry
        by_scope[scoped] = {
            "data_type": (data or {}).get("dataType") or "graphicNovels",
            "entries": entry_map
        }
    return by_scope


def build_workspaces(config):
    workspaces = list((config or {}).get("workspaces") or [])
    if not workspaces:
        workspaces = [{"id": "main", "name": "Main", "icon": "\U0001F3E0"}]
    normalized = []
    seen = set()
    for ws in workspaces:
        ws_id = str((ws or {}).get("id") or "").strip() or "main"
        if ws_id in seen:
            continue
        seen.add(ws_id)
        normalized.append({
            "id": ws_id,
            "name": (ws or {}).get("name") or ws_id,
            "icon": (ws or {}).get("icon") or "\U0001F4C1"
        })
    return normalized


def prepare_workspace_map(links, workspaces):
    by_workspace = {}
    for ws in workspaces:
        by_workspace[ws["id"]] = {
            "meta": ws,
            "links": [],
            "categories": {}
        }

    for link in links:
        item = dict(link or {})
        workspace_id = str(item.get("workspace") or "").strip() or "main"
        category_name = str(item.get("category") or "").strip() or "Unsorted"
        item["workspace"] = workspace_id
        item["category"] = category_name
        if workspace_id not in by_workspace:
            by_workspace[workspace_id] = {
                "meta": {"id": workspace_id, "name": workspace_id, "icon": "\U0001F4C1"},
                "links": [],
                "categories": {}
            }
        by_workspace[workspace_id]["links"].append(item)
        by_workspace[workspace_id]["categories"].setdefault(category_name, []).append(item)

    return by_workspace


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


def resolve_bookmark_folder(card_folder, card_data):
    bookmark_folder_name = (card_data or {}).get("bookmarkFolder") or "entries"
    bookmark_folder = card_folder / bookmark_folder_name
    if bookmark_folder.exists():
        return bookmark_folder

    entries_folder = card_folder / "entries"
    legacy_named_folder = card_folder / card_folder.name
    if entries_folder.exists():
        return entries_folder
    if legacy_named_folder.exists():
        return legacy_named_folder
    return card_folder


def upsert_card_metadata(card_folder, workspace_id, category_name):
    card_file = card_folder / "card.json"
    card_data = load_json_file(card_file, fallback={})
    if not isinstance(card_data, dict):
        card_data = {}

    bookmark_folder = resolve_bookmark_folder(card_folder, card_data)
    bookmark_folder_name = "entries" if paths_equal(bookmark_folder, card_folder / "entries") else (card_data.get("bookmarkFolder") or "entries")
    try:
        bookmark_count = len([p for p in bookmark_folder.glob("*.json") if p.is_file() and not p.name.startswith("_")])
    except Exception:
        bookmark_count = int(card_data.get("bookmarkCount") or 0)

    updated = dict(card_data)
    updated["schema"] = "eveos.card.v1"
    updated["workspaceId"] = workspace_id
    updated["categoryName"] = category_name
    updated["title"] = category_name
    updated["bookmarkFolder"] = bookmark_folder_name
    updated["bookmarkCount"] = bookmark_count

    if updated != card_data:
        card_file.write_text(json.dumps(updated, ensure_ascii=False, indent=2), encoding="utf-8")


def merge_unlinked_library_files(source_file, target_file, workspace_id, category_name):
    source_payload = load_json_file(source_file, fallback={})
    target_payload = load_json_file(target_file, fallback={})
    source_entries = list((source_payload or {}).get("entries") or [])
    target_entries = list((target_payload or {}).get("entries") or [])

    merged_entries = []
    seen_ids = set()
    for entry in target_entries + source_entries:
        entry_id = str((entry or {}).get("id") or "").strip()
        if entry_id and entry_id in seen_ids:
            continue
        if entry_id:
            seen_ids.add(entry_id)
        merged_entries.append(entry)

    merged_payload = {
        "schema": "eveos.card-library-unlinked.v1",
        "workspaceId": workspace_id,
        "categoryName": category_name,
        "entries": merged_entries
    }
    target_file.write_text(json.dumps(merged_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if source_file.exists() and not paths_equal(source_file, target_file):
        source_file.unlink(missing_ok=True)


def move_bookmark_file(source_file, target_folder):
    target_folder.mkdir(parents=True, exist_ok=True)
    target_file = target_folder / source_file.name
    if not target_file.exists():
        source_file.replace(target_file)
        return target_file

    source_link_id = read_bookmark_id_from_file(source_file)
    target_link_id = read_bookmark_id_from_file(target_file)
    if source_link_id and source_link_id == target_link_id:
        try:
            source_mtime = int(source_file.stat().st_mtime_ns)
        except Exception:
            source_mtime = 0
        try:
            target_mtime = int(target_file.stat().st_mtime_ns)
        except Exception:
            target_mtime = 0
        if source_mtime >= target_mtime:
            source_file.replace(target_file)
        else:
            source_file.unlink(missing_ok=True)
        return target_file

    short_hash = hashlib.sha1(str(source_file).encode("utf-8")).hexdigest()[:6]
    stem = source_file.stem
    suffix = source_file.suffix
    candidate = target_folder / safe_filename(f"{stem}--{short_hash}{suffix}", source_file.name)
    if candidate.exists():
        short_hash = hashlib.sha1(f"{source_file}-{time.time_ns()}".encode("utf-8")).hexdigest()[:8]
        candidate = target_folder / safe_filename(f"{stem}--{short_hash}{suffix}", source_file.name)
    source_file.replace(candidate)
    return candidate


def merge_card_folders(source_folder, target_folder, workspace_id, category_name):
    source_card_data = load_json_file(source_folder / "card.json", fallback={})
    target_card_data = load_json_file(target_folder / "card.json", fallback={})
    source_bookmark_folder = resolve_bookmark_folder(source_folder, source_card_data)
    target_bookmark_folder = resolve_bookmark_folder(target_folder, target_card_data)

    if source_bookmark_folder.exists():
        for bookmark_file in sorted(source_bookmark_folder.glob("*.json")):
            if bookmark_file.name.startswith("_"):
                continue
            try:
                move_bookmark_file(bookmark_file, target_bookmark_folder)
            except Exception:
                logger.warning("Failed to move bookmark file during card merge: %s", bookmark_file)

    source_unlinked = source_folder / "_library-unlinked.json"
    target_unlinked = target_folder / "_library-unlinked.json"
    if source_unlinked.exists():
        try:
            if target_unlinked.exists():
                merge_unlinked_library_files(source_unlinked, target_unlinked, workspace_id, category_name)
            else:
                source_unlinked.replace(target_unlinked)
        except Exception:
            logger.warning("Failed to merge unlinked library files for card merge: %s -> %s", source_unlinked, target_unlinked)

    try:
        if source_bookmark_folder.exists() and source_bookmark_folder.is_dir() and source_bookmark_folder != source_folder:
            source_bookmark_folder.rmdir()
    except Exception:
        pass

    try:
        (source_folder / "card.json").unlink(missing_ok=True)
    except Exception:
        pass

    try:
        source_folder.rmdir()
    except Exception:
        pass

    upsert_card_metadata(target_folder, workspace_id, category_name)


def normalize_workspace_card_layout(cards_root, workspace_id):
    if not cards_root.exists():
        return

    initial_folders = [path for path in sorted(cards_root.iterdir()) if path.is_dir()]
    for card_folder in initial_folders:
        if not card_folder.exists() or not card_folder.is_dir():
            continue

        card_data = load_json_file(card_folder / "card.json", fallback={})
        category_name = resolve_card_category_name(card_data, card_folder.name)
        canonical_folder = cards_root / folder_name(category_name, "card")

        if paths_equal(card_folder, canonical_folder):
            upsert_card_metadata(card_folder, workspace_id, category_name)
            continue

        if not canonical_folder.exists():
            try:
                card_folder.rename(canonical_folder)
                logger.info("Renamed card folder to canonical name: %s -> %s", card_folder.name, canonical_folder.name)
                upsert_card_metadata(canonical_folder, workspace_id, category_name)
            except Exception:
                logger.warning("Failed to rename card folder '%s' to '%s'", card_folder, canonical_folder)
            continue

        logger.info(
            "Merging card folder '%s' into existing '%s' for workspace '%s' category '%s'",
            card_folder.name,
            canonical_folder.name,
            workspace_id,
            category_name
        )
        merge_card_folders(card_folder, canonical_folder, workspace_id, category_name)
