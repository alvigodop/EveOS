import json

from server_modules.eve_state_store_files_folders import (
    normalize_bookmark_folder_node,
    normalize_bookmark_folder_tree,
    normalize_bookmark_folder_tree_settings,
    normalize_workspace_card_layout,
    resolve_bookmark_folder,
)
from server_modules.eve_state_store_files_shared import (
    load_json_file,
    logger,
    normalize_bookmark_filename,
    resolve_card_category_name,
    scoped_key,
)
from server_modules.eve_state_store_files_workspaces import normalize_library_folder_view


def _read_bookmark_payload_record(bookmark_file, workspace_id, category_name, scoped, folder_id=None):
    try:
        payload = json.loads(bookmark_file.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("Skipping invalid bookmark file: %s", bookmark_file)
        return None

    bookmark = payload.get("bookmark") if isinstance(payload, dict) else None
    if not isinstance(bookmark, dict):
        bookmark = payload if isinstance(payload, dict) else {}

    link_id = str(bookmark.get("id") or "").strip()
    if not link_id:
        return None

    bookmark_file = normalize_bookmark_filename(
        bookmark_file, bookmark, category_name=category_name
    )

    try:
        mtime_ns = int(bookmark_file.stat().st_mtime_ns)
    except Exception:
        mtime_ns = 0

    bookmark_record = dict(bookmark or {})
    if folder_id:
        bookmark_record["folderId"] = folder_id
    else:
        bookmark_record.pop("folderId", None)

    return {
        "link_id": link_id,
        "bookmark": bookmark_record,
        "library_payload": payload.get("library")
        if isinstance(payload, dict)
        else None,
        "workspace_id": workspace_id,
        "category_name": category_name,
        "scoped_key": scoped,
        "source_path": str(bookmark_file),
        "mtime_ns": mtime_ns,
    }


def _ingest_entries_dir(
    entries_dir, workspace_id, category_name, scoped, bookmark_records, folder_id=None
):
    if not entries_dir.exists() or not entries_dir.is_dir():
        return

    for bookmark_file in sorted(entries_dir.glob("*.json")):
        if bookmark_file.name.startswith("_") or bookmark_file.name == "folder.json":
            continue
        record = _read_bookmark_payload_record(
            bookmark_file,
            workspace_id,
            category_name,
            scoped,
            folder_id=folder_id,
        )
        if record:
            bookmark_records.append(record)


def _ingest_folder_branches(
    folders_root,
    workspace_id,
    category_name,
    scoped,
    bookmark_records,
    folder_tree_nodes,
    parent_id=None,
):
    if not folders_root.exists() or not folders_root.is_dir():
        return

    for folder_dir in sorted(folders_root.iterdir()):
        if not folder_dir.is_dir():
            continue
        folder_payload = load_json_file(folder_dir / "folder.json", fallback={})
        normalized_node = normalize_bookmark_folder_node(
            {
                **folder_payload,
                "parentId": parent_id
                if parent_id is not None
                else folder_payload.get("parentId"),
                "name": folder_payload.get("name")
                or folder_payload.get("title")
                or folder_dir.name,
            }
        )
        if parent_id:
            normalized_node["parentId"] = parent_id
        folder_tree_nodes.append(normalized_node)

        _ingest_entries_dir(
            folder_dir / "entries",
            workspace_id,
            category_name,
            scoped,
            bookmark_records,
            folder_id=normalized_node["id"],
        )
        _ingest_folder_branches(
            folder_dir / "folders",
            workspace_id,
            category_name,
            scoped,
            bookmark_records,
            folder_tree_nodes,
            parent_id=normalized_node["id"],
        )


def ingest_cards_root(
    cards_root,
    workspace_id,
    categories,
    entry_ids_by_scope,
    bookmark_records,
    bookmark_folders,
):
    if not cards_root.exists() or not cards_root.is_dir():
        return

    normalize_workspace_card_layout(cards_root, workspace_id)

    for card_folder in sorted(cards_root.iterdir()):
        if not card_folder.is_dir():
            continue

        card_file = card_folder / "card.json"
        card_data = load_json_file(card_file, fallback={})
        category_name = resolve_card_category_name(card_data, card_folder.name)
        data_type = card_data.get("dataType") or "graphicNovels"
        bookmark_folder = resolve_bookmark_folder(card_folder, card_data)

        scoped = scoped_key(workspace_id, category_name)
        if scoped not in categories:
            categories[scoped] = {
                "entries": [],
                "dataType": data_type,
                "folderView": normalize_library_folder_view(
                    card_data.get("libraryFolderView") or {}
                ),
            }
        else:
            categories[scoped]["dataType"] = (
                categories[scoped].get("dataType") or data_type
            )
            if "folderView" not in categories[scoped]:
                categories[scoped]["folderView"] = normalize_library_folder_view(
                    card_data.get("libraryFolderView") or {}
                )

        if scoped not in entry_ids_by_scope:
            entry_ids_by_scope[scoped] = {
                str((entry or {}).get("id") or "").strip()
                for entry in categories[scoped]["entries"]
                if str((entry or {}).get("id") or "").strip()
            }
        entry_ids_for_scope = entry_ids_by_scope[scoped]
        _ingest_entries_dir(
            bookmark_folder,
            workspace_id,
            category_name,
            scoped,
            bookmark_records,
            folder_id=None,
        )
        folder_tree_nodes = []
        _ingest_folder_branches(
            card_folder / "folders",
            workspace_id,
            category_name,
            scoped,
            bookmark_records,
            folder_tree_nodes,
            parent_id=None,
        )
        folder_tree = normalize_bookmark_folder_tree(
            {
                "nodes": folder_tree_nodes,
                "settings": {"clickBehaviorMode": card_data.get("clickBehaviorMode")},
            }
        )
        if folder_tree.get("nodes") or normalize_bookmark_folder_tree_settings(
            folder_tree.get("settings")
        ).get("clickBehaviorMode") != "inherit":
            bookmark_folders[scoped] = folder_tree

        unlinked_file = card_folder / "_library-unlinked.json"
        if unlinked_file.exists():
            try:
                unlinked_payload = json.loads(unlinked_file.read_text(encoding="utf-8"))
                unlinked_entries = unlinked_payload.get("entries") or []
                for entry in unlinked_entries:
                    entry_id = str((entry or {}).get("id") or "").strip()
                    if not entry_id or entry_id in entry_ids_for_scope:
                        continue
                    categories[scoped]["entries"].append(entry)
                    entry_ids_for_scope.add(entry_id)
            except Exception:
                logger.warning(
                    "Skipping invalid unlinked library file: %s", unlinked_file
                )
