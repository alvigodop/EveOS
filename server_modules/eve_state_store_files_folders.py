import json
import logging
import shutil

from server_modules.eve_state_store_files_pins import (
    normalize_click_behavior_mode,
    normalize_task_mode,
)
from server_modules.eve_state_store_files_shared import (
    clean_name_segment,
    folder_name,
    load_json_file,
    logger,
    paths_equal,
    read_bookmark_id_from_file,
    resolve_card_category_name,
    safe_filename,
    short_hash,
    slugify,
    unique_move_candidate,
)


def normalize_bookmark_folder_tree_settings(settings):
    source = settings if isinstance(settings, dict) else {}
    return {
        "clickBehaviorMode": normalize_click_behavior_mode(source.get("clickBehaviorMode"))
    }


def normalize_bookmark_folder_node(node, fallback_name="Folder"):
    item = dict(node or {})
    folder_id = str(item.get("id") or "").strip()
    parent_id = str(item.get("parentId") or "").strip()
    name = str(item.get("name") or item.get("title") or "").strip() or fallback_name
    if not folder_id:
        folder_seed = f"{parent_id}::{name}::{item.get('order')}"
        folder_id = f"folder-{short_hash(folder_seed, 10)}"
    try:
        order = int(item.get("order") or 0)
    except Exception:
        order = 0
    return {
        "id": folder_id,
        "parentId": parent_id or None,
        "name": name,
        "order": order,
        "createdAt": str(item.get("createdAt") or "").strip(),
        "updatedAt": str(item.get("updatedAt") or "").strip(),
        "clickBehaviorMode": normalize_click_behavior_mode(item.get("clickBehaviorMode")),
        "taskMode": normalize_task_mode(item.get("taskMode")),
    }


def normalize_bookmark_folder_tree(tree):
    raw_nodes = []
    settings = normalize_bookmark_folder_tree_settings({})
    if isinstance(tree, dict):
        raw_nodes = list(tree.get("nodes") or [])
        settings = normalize_bookmark_folder_tree_settings(tree.get("settings") or tree)
    elif isinstance(tree, list):
        raw_nodes = list(tree)

    normalized = []
    seen_ids = set()
    for raw_node in raw_nodes:
        node = normalize_bookmark_folder_node(raw_node)
        folder_id = node["id"]
        if folder_id in seen_ids:
            continue
        seen_ids.add(folder_id)
        normalized.append(node)

    valid_ids = {node["id"] for node in normalized}
    for node in normalized:
        parent_id = str(node.get("parentId") or "").strip()
        if not parent_id or parent_id == node["id"] or parent_id not in valid_ids:
            node["parentId"] = None

    normalized.sort(
        key=lambda item: (
            str(item.get("parentId") or ""),
            int(item.get("order") or 0),
            str(item.get("name") or "").lower(),
            str(item.get("id") or ""),
        )
    )
    return {
        "nodes": normalized,
        "settings": settings,
    }


def build_bookmark_folder_dirname(folder_node):
    item = normalize_bookmark_folder_node(folder_node)
    slug = clean_name_segment(slugify(item.get("name") or "folder", "folder"), "folder", 20)
    return f"{slug}--{short_hash(item.get('id') or item.get('name') or 'folder', 8)}"


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
    root_bookmark_files = [
        path for path in card_folder.glob("*.json")
        if path.is_file() and path.name not in {"card.json", "_library-unlinked.json"}
    ]
    if root_bookmark_files:
        return card_folder
    return bookmark_folder


def count_card_bookmarks(card_folder, card_data):
    total = 0
    bookmark_folder = resolve_bookmark_folder(card_folder, card_data)
    if bookmark_folder.exists() and bookmark_folder.is_dir():
        total += len(
            [
                p for p in bookmark_folder.glob("*.json")
                if p.is_file() and not p.name.startswith("_")
            ]
        )

    folders_root = card_folder / "folders"
    if folders_root.exists() and folders_root.is_dir():
        for bookmark_file in folders_root.rglob("*.json"):
            if not bookmark_file.is_file():
                continue
            if bookmark_file.name in {"folder.json"} or bookmark_file.name.startswith("_"):
                continue
            if bookmark_file.parent.name != "entries":
                continue
            total += 1
    return total


def count_card_folder_nodes(card_folder):
    folders_root = card_folder / "folders"
    if not folders_root.exists() or not folders_root.is_dir():
        return 0
    return len(
        [
            path for path in folders_root.rglob("folder.json")
            if path.is_file()
        ]
    )


def upsert_card_metadata(card_folder, workspace_id, category_name):
    card_file = card_folder / "card.json"
    card_data = load_json_file(card_file, fallback={})
    if not isinstance(card_data, dict):
        card_data = {}

    bookmark_folder = resolve_bookmark_folder(card_folder, card_data)
    bookmark_folder_name = "entries" if paths_equal(bookmark_folder, card_folder / "entries") else (card_data.get("bookmarkFolder") or "entries")
    try:
        bookmark_count = count_card_bookmarks(card_folder, card_data)
    except Exception:
        bookmark_count = int(card_data.get("bookmarkCount") or 0)
    try:
        folder_count = count_card_folder_nodes(card_folder)
    except Exception:
        folder_count = int(card_data.get("folderCount") or 0)

    updated = dict(card_data)
    updated["schema"] = "eveos.card.v2"
    updated["workspaceId"] = workspace_id
    updated["categoryName"] = category_name
    updated["title"] = category_name
    updated["clickBehaviorMode"] = normalize_click_behavior_mode(card_data.get("clickBehaviorMode"))
    updated["bookmarkFolder"] = bookmark_folder_name
    updated["bookmarkCount"] = bookmark_count
    updated["folderRoot"] = "folders"
    updated["folderCount"] = folder_count

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
        "entries": merged_entries,
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

    candidate = unique_move_candidate(source_file, target_folder)
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

    source_folders_root = source_folder / "folders"
    target_folders_root = target_folder / "folders"
    if source_folders_root.exists() and source_folders_root.is_dir():
        try:
            shutil.copytree(source_folders_root, target_folders_root, dirs_exist_ok=True)
            shutil.rmtree(source_folders_root, ignore_errors=True)
        except Exception:
            logger.warning(
                "Failed to merge nested bookmark folders during card merge: %s -> %s",
                source_folders_root,
                target_folders_root,
            )

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
            category_name,
        )
        merge_card_folders(card_folder, canonical_folder, workspace_id, category_name)
