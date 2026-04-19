import json
import logging
import time

from server_modules.eve_state_store_files_folders import (
    normalize_bookmark_folder_node,
    normalize_bookmark_folder_tree,
    normalize_bookmark_folder_tree_settings,
    normalize_workspace_card_layout,
    resolve_bookmark_folder,
)
from server_modules.eve_state_store_files_pins import (
    derive_quick_pins_from_links,
    normalize_quick_pins,
)
from server_modules.eve_state_store_files_shared import (
    connection_entry_id,
    load_json_file,
    logger,
    resolve_card_category_name,
    scoped_key,
)
from server_modules.eve_state_store_files_workspaces import (
    build_workspaces,
    find_workspace_node,
    iter_workspace_nodes,
    normalize_library_folder_view,
)
from server_modules.eve_state_store_io_shared import normalize_workspace_meta_record
from server_modules.eve_state_store_io_write import _write_bookmark_payload  # noqa: F401
from server_modules.eve_state_store_files_shared import normalize_bookmark_filename
from server_modules.eve_state_store_paths import infer_workspace_from_cards_root


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


def _ingest_entries_dir(entries_dir, workspace_id, category_name, scoped, bookmark_records, folder_id=None):
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
                "parentId": parent_id if parent_id is not None else folder_payload.get("parentId"),
                "name": folder_payload.get("name") or folder_payload.get("title") or folder_dir.name,
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


def ingest_cards_root(cards_root, workspace_id, categories, entry_ids_by_scope, bookmark_records, bookmark_folders):
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
                "folderView": normalize_library_folder_view(card_data.get("libraryFolderView") or {}),
            }
        else:
            categories[scoped]["dataType"] = categories[scoped].get("dataType") or data_type
            if "folderView" not in categories[scoped]:
                categories[scoped]["folderView"] = normalize_library_folder_view(card_data.get("libraryFolderView") or {})

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
        folder_tree = normalize_bookmark_folder_tree({
            "nodes": folder_tree_nodes,
            "settings": {
                "clickBehaviorMode": card_data.get("clickBehaviorMode")
            }
        })
        if folder_tree.get("nodes") or normalize_bookmark_folder_tree_settings(folder_tree.get("settings")).get("clickBehaviorMode") != "inherit":
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


def read_modular_state_raw(*, store_root, meta_dir, tabs_dir, format_version):
    if not store_root.exists():
        raise FileNotFoundError(f"Modular state store not found at: {store_root}")

    store_meta = {}
    config = {}
    store_file = meta_dir / "store.json"
    config_file = meta_dir / "config.json"
    pins_file = meta_dir / "pins.json"

    if store_file.exists():
        store_meta = json.loads(store_file.read_text(encoding="utf-8"))
    if config_file.exists():
        config = json.loads(config_file.read_text(encoding="utf-8"))
    quick_pins = []
    if pins_file.exists():
        pins_payload = load_json_file(pins_file, fallback={})
        quick_pins = normalize_quick_pins((pins_payload or {}).get("pins"), links=None)
    knowledge = {"scopedStorage": {}}
    knowledge_file = store_root / "knowledge" / "scoped-storage.json"
    if knowledge_file.exists():
        knowledge_payload = load_json_file(knowledge_file, fallback={})
        if isinstance((knowledge_payload or {}).get("scopedStorage"), dict):
            knowledge["scopedStorage"] = dict(knowledge_payload.get("scopedStorage") or {})

    links = []
    connections_by_link = {}
    categories = {}
    workspaces = []
    seen_workspace_ids = set()
    bookmark_records = []
    bookmark_folders = {}
    entry_ids_by_scope = {}
    configured_workspaces = build_workspaces(config)
    configured_workspace_meta = {
        str((workspace or {}).get("id") or "").strip(): dict(workspace or {})
        for workspace in iter_workspace_nodes(configured_workspaces)
        if str((workspace or {}).get("id") or "").strip()
    }

    discovered_workspace_meta = {}
    discovered_workspace_parents = {}
    discovered_workspace_order = []

    def ingest_workspace_folder(ws_folder, parent_workspace_id=""):
        if not ws_folder.exists() or not ws_folder.is_dir():
            return

        tab_file = ws_folder / "tab.json"
        tab_data = {}
        if tab_file.exists():
            try:
                tab_data = json.loads(tab_file.read_text(encoding="utf-8"))
            except Exception:
                tab_data = {}

        workspace_id = str(tab_data.get("id") or "").strip() or ws_folder.name
        workspace_name = tab_data.get("name") or workspace_id
        workspace_icon = tab_data.get("icon") or "folder"
        workspace_meta = normalize_workspace_meta_record(
            {
                **dict(configured_workspace_meta.get(workspace_id) or {}),
                **dict(tab_data or {}),
            },
            fallback_id=workspace_id,
            fallback_name=workspace_name,
            fallback_icon=workspace_icon,
        )

        if workspace_id not in discovered_workspace_meta:
            discovered_workspace_order.append(workspace_id)
        discovered_workspace_meta[workspace_id] = workspace_meta
        discovered_workspace_parents[workspace_id] = str(parent_workspace_id or "").strip()

        cards_root = ws_folder / "cards"
        ingest_cards_root(
            cards_root, workspace_id, categories, entry_ids_by_scope, bookmark_records, bookmark_folders
        )

        nested_tabs_root = ws_folder / "tabs"
        if nested_tabs_root.exists() and nested_tabs_root.is_dir():
            for child_folder in sorted(nested_tabs_root.iterdir()):
                if not child_folder.is_dir():
                    continue
                ingest_workspace_folder(child_folder, workspace_id)

    if tabs_dir.exists():
        for workspace_folder in sorted(tabs_dir.iterdir()):
            if not workspace_folder.is_dir():
                continue
            ingest_workspace_folder(workspace_folder)
    else:
        direct_cards_root = store_root / "cards"
        if direct_cards_root.exists() and direct_cards_root.is_dir():
            workspace_id = infer_workspace_from_cards_root(
                direct_cards_root, config=config, store_meta=store_meta
            )
            workspace_meta = find_workspace_node(configured_workspaces, workspace_id)
            workspace_name = (workspace_meta or {}).get("name") or workspace_id
            workspace_icon = (workspace_meta or {}).get("icon") or "folder"
            normalized_workspace_meta = normalize_workspace_meta_record(
                workspace_meta,
                fallback_id=workspace_id,
                fallback_name=workspace_name,
                fallback_icon=workspace_icon,
            )

            if workspace_id not in seen_workspace_ids:
                seen_workspace_ids.add(workspace_id)
                workspaces.append(normalized_workspace_meta)

            ingest_cards_root(
                direct_cards_root,
                workspace_id,
                categories,
                entry_ids_by_scope,
                bookmark_records,
                bookmark_folders,
            )

    resolved_by_link = {}
    for record in bookmark_records:
        link_id = record["link_id"]
        existing = resolved_by_link.get(link_id)
        if existing is None:
            resolved_by_link[link_id] = record
            continue
        existing_mtime = int(existing.get("mtime_ns") or 0)
        next_mtime = int(record.get("mtime_ns") or 0)
        if (next_mtime, record.get("source_path", "")) >= (
            existing_mtime,
            existing.get("source_path", ""),
        ):
            logger.warning(
                "Duplicate bookmark id '%s' detected. Keeping newer file '%s' (replacing '%s').",
                link_id,
                record.get("source_path"),
                existing.get("source_path"),
            )
            resolved_by_link[link_id] = record
        else:
            logger.warning(
                "Duplicate bookmark id '%s' detected. Keeping newer file '%s' and skipping '%s'.",
                link_id,
                existing.get("source_path"),
                record.get("source_path"),
            )

    for record in sorted(
        resolved_by_link.values(),
        key=lambda item: (
            item.get("workspace_id", ""),
            item.get("category_name", ""),
            item.get("source_path", ""),
        ),
    ):
        workspace_id = record["workspace_id"]
        category_name = record["category_name"]
        scoped = record["scoped_key"]
        link_id = record["link_id"]

        bookmark = dict(record.get("bookmark") or {})
        bookmark["workspace"] = workspace_id
        bookmark["category"] = category_name
        links.append(bookmark)

        library_payload = record.get("library_payload")
        if not isinstance(library_payload, dict):
            continue

        connection = library_payload.get("connection")
        entry = library_payload.get("entry")
        linked = bool(library_payload.get("linked"))
        if not linked or not isinstance(entry, dict):
            continue

        normalized_connection = dict(connection) if isinstance(connection, dict) else {}
        normalized_connection["linkId"] = link_id
        normalized_connection["workspace"] = workspace_id
        normalized_connection["categoryName"] = category_name
        if not normalized_connection.get("id"):
            normalized_connection["id"] = f"conn-{link_id}"
        if not normalized_connection.get("libraryEntryId") and entry.get("id"):
            normalized_connection["libraryEntryId"] = entry.get("id")

        if normalized_connection.get("libraryEntryId"):
            connections_by_link[link_id] = normalized_connection

        entry_id = str(entry.get("id") or "").strip()
        if not entry_id:
            continue
        if scoped not in categories:
            categories[scoped] = {"entries": [], "dataType": "graphicNovels"}
        if scoped not in entry_ids_by_scope:
            entry_ids_by_scope[scoped] = set()
        if entry_id not in entry_ids_by_scope[scoped]:
            categories[scoped]["entries"].append(entry)
            entry_ids_by_scope[scoped].add(entry_id)

    if discovered_workspace_meta:
        merged_workspaces = build_workspaces(config)
        merged_workspace_index = {
            str((workspace or {}).get("id") or "").strip(): workspace
            for workspace in iter_workspace_nodes(merged_workspaces)
            if str((workspace or {}).get("id") or "").strip()
        }

        for workspace_id in discovered_workspace_order:
            discovered_meta = dict(discovered_workspace_meta.get(workspace_id) or {})
            if workspace_id in merged_workspace_index:
                existing_workspace = merged_workspace_index[workspace_id]
                existing_workspace["name"] = discovered_meta.get("name") or existing_workspace.get("name") or workspace_id
                existing_workspace["icon"] = discovered_meta.get("icon") or existing_workspace.get("icon") or "folder"
                if not isinstance(existing_workspace.get("subTabs"), list):
                    existing_workspace["subTabs"] = []
                continue

            next_workspace = normalize_workspace_meta_record(
                discovered_meta,
                fallback_id=workspace_id,
                fallback_name=discovered_meta.get("name") or workspace_id,
                fallback_icon=discovered_meta.get("icon") or "folder",
            )
            parent_workspace_id = str(discovered_workspace_parents.get(workspace_id) or "").strip()
            parent_workspace = merged_workspace_index.get(parent_workspace_id)
            if parent_workspace is not None:
                if not isinstance(parent_workspace.get("subTabs"), list):
                    parent_workspace["subTabs"] = []
                parent_workspace["subTabs"].append(next_workspace)
            else:
                merged_workspaces.append(next_workspace)
            merged_workspace_index[workspace_id] = next_workspace

        workspaces = merged_workspaces

    if not quick_pins:
        quick_pins = derive_quick_pins_from_links(links)
    else:
        quick_pins = normalize_quick_pins(quick_pins, links=links)

    if not workspaces:
        workspaces = [{"id": "main", "name": "Main", "icon": "home"}]

    merged_config = dict(config or {})
    merged_config["workspaces"] = workspaces
    merged_config["activeWorkspace"] = (
        merged_config.get("activeWorkspace")
        or store_meta.get("activeWorkspace")
        or workspaces[0]["id"]
    )

    return {
        "metadata": {
            "version": format_version,
            "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "generator": "EveOS Modular State Loader",
            "source": "modular-state",
        },
        "bookmarks": {
            "links": links,
            "config": merged_config,
            "folders": bookmark_folders,
            "pins": quick_pins,
        },
        "library": {
            "categories": categories,
            "connections": list(connections_by_link.values()),
        },
        "knowledge": knowledge,
    }
