import json
import logging
import time

from server_modules.eve_state_store_files import (
    build_bookmark_filename,
    build_bookmark_folder_dirname,
    build_library_index,
    build_workspaces,
    connection_entry_id,
    derive_quick_pins_from_links,
    folder_name,
    load_json_file,
    normalize_quick_pins,
    normalize_bookmark_folder_tree_settings,
    normalize_click_behavior_mode,
    normalize_bookmark_folder_node,
    normalize_bookmark_folder_tree,
    normalize_library_folder_view,
    normalize_bookmark_filename,
    normalize_workspace_card_layout,
    prepare_workspace_map,
    count_card_folder_nodes,
    resolve_bookmark_folder,
    resolve_card_category_name,
    scoped_key,
)
from server_modules.eve_state_store_paths import infer_workspace_from_cards_root


logger = logging.getLogger("FandomDiscoveryServer")


def _normalize_workspace_meta_record(raw_workspace, *, fallback_id="main", fallback_name=None, fallback_icon="folder"):
    workspace_meta = dict(raw_workspace or {}) if isinstance(raw_workspace, dict) else {}

    workspace_id = str(workspace_meta.get("id") or fallback_id or "").strip() or "main"
    workspace_meta["id"] = workspace_id
    workspace_meta["name"] = workspace_meta.get("name") or fallback_name or workspace_id
    workspace_meta["icon"] = workspace_meta.get("icon") or fallback_icon or "folder"

    if not isinstance(workspace_meta.get("subTabs"), list):
        workspace_meta["subTabs"] = []

    workspace_meta.pop("schema", None)
    workspace_meta.pop("bookmarkCount", None)
    workspace_meta.pop("cardCount", None)
    return workspace_meta


def _normalize_bookmark_folders_map(raw_folders):
    normalized = {}
    for key, tree in (raw_folders or {}).items():
        parsed = key if isinstance(key, dict) else None
        if parsed is None:
            scoped = str(key or "").strip()
            if not scoped:
                continue
            if "::" in scoped:
                workspace_id, category_name = scoped.split("::", 1)
            else:
                workspace_id, category_name = "main", scoped
        else:
            workspace_id = str(parsed.get("workspace_id") or "main").strip() or "main"
            category_name = str(parsed.get("category_name") or "Unsorted").strip() or "Unsorted"
        scoped = scoped_key(workspace_id, category_name)
        normalized_tree = normalize_bookmark_folder_tree(tree)
        nodes = list(normalized_tree.get("nodes") or [])
        settings = normalize_bookmark_folder_tree_settings(normalized_tree.get("settings"))
        if nodes or settings.get("clickBehaviorMode") != "inherit":
            normalized[scoped] = {
                "nodes": nodes,
                "settings": settings,
            }
    return normalized


def _write_bookmark_payload(bookmark_folder, link, category_name, conn, linked_entry):
    bookmark_payload = {
        "schema": "eveos.bookmark.v1",
        "bookmark": link,
        "library": {
            "linked": linked_entry is not None,
            "connection": conn or None,
            "entry": linked_entry or None,
        },
    }
    bookmark_file = build_bookmark_filename(link, category_name=category_name)
    (bookmark_folder / bookmark_file).write_text(
        json.dumps(bookmark_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _write_bookmark_folder_branch(
    parent_folder,
    children_by_parent,
    folder_links,
    *,
    workspace_id,
    category_name,
    connections_by_link,
    scoped_library,
    library_index_values,
    used_entry_ids,
    parent_id=None,
):
    child_nodes = list((children_by_parent or {}).get(parent_id, []))
    if not child_nodes:
        return 0

    written = 0
    folders_root = parent_folder / "folders"
    folders_root.mkdir(parents=True, exist_ok=True)

    for node in child_nodes:
        folder_dir = folders_root / build_bookmark_folder_dirname(node)
        folder_dir.mkdir(parents=True, exist_ok=True)
        normalized_node = normalize_bookmark_folder_node(node)
        folder_payload = {
            "schema": "eveos.bookmark-folder.v1",
            "workspaceId": workspace_id,
            "categoryName": category_name,
            **normalized_node,
        }
        (folder_dir / "folder.json").write_text(
            json.dumps(folder_payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        entries_dir = folder_dir / "entries"
        entries_dir.mkdir(parents=True, exist_ok=True)
        for link in folder_links.get(normalized_node["id"], []):
            link_id = str(link.get("id") or "").strip()
            conn = connections_by_link.get(link_id)
            linked_entry = None
            if conn:
                entry_id = str(connection_entry_id(conn) or "").strip()
                if entry_id:
                    used_entry_ids.add(entry_id)
                    linked_entry = (scoped_library.get("entries") or {}).get(entry_id)
                    if not linked_entry:
                        for candidate in library_index_values or []:
                            entry_map = candidate.get("entries") or {}
                            if entry_id in entry_map:
                                linked_entry = entry_map[entry_id]
                                break
            _write_bookmark_payload(entries_dir, link, category_name, conn, linked_entry)
            written += 1

        written += _write_bookmark_folder_branch(
            folder_dir,
            children_by_parent,
            folder_links,
            workspace_id=workspace_id,
            category_name=category_name,
            connections_by_link=connections_by_link,
            scoped_library=scoped_library,
            library_index_values=library_index_values,
            used_entry_ids=used_entry_ids,
            parent_id=normalized_node["id"],
        )

    return written


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

def write_modular_state_full(
    state,
    *,
    store_root,
    meta_dir,
    tabs_dir,
    format_version,
    ensure_clean_store,
    collect_status,
):
    if not isinstance(state, dict):
        raise ValueError("State payload must be a JSON object.")

    bookmarks = state.get("bookmarks") or {}
    library = state.get("library") or {}
    config = bookmarks.get("config") or {}
    links = list(bookmarks.get("links") or [])
    bookmark_folders = _normalize_bookmark_folders_map(bookmarks.get("folders") or {})
    quick_pins = normalize_quick_pins(bookmarks.get("pins"), links=links)
    connections = list(library.get("connections") or [])
    categories = library.get("categories") or {}
    knowledge = state.get("knowledge") if isinstance(state.get("knowledge"), dict) else {"scopedStorage": {}}

    ensure_clean_store()

    workspaces = build_workspaces(config)
    workspace_map = prepare_workspace_map(links, workspaces, categories=categories, folder_trees=bookmark_folders)
    library_index = build_library_index(categories)
    library_index_values = list(library_index.values())

    connections_by_link = {}
    connected_entry_ids = set()
    for conn in connections:
        link_id = str((conn or {}).get("linkId") or "").strip()
        if not link_id:
            continue
        connections_by_link[link_id] = dict(conn)
        entry_id = connection_entry_id(conn or {})
        if entry_id:
            connected_entry_ids.add(str(entry_id))

    store_meta = {
        "format": "eveos.modular-state.v1",
        "version": format_version,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "activeWorkspace": config.get("activeWorkspace") or "main",
        "workspaces": workspaces,
    }

    (meta_dir / "store.json").write_text(
        json.dumps(store_meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (meta_dir / "config.json").write_text(
        json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (meta_dir / "pins.json").write_text(
        json.dumps({
            "schema": "eveos.quick-pins.v1",
            "pins": quick_pins,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    knowledge_root = store_root / "knowledge"
    knowledge_root.mkdir(parents=True, exist_ok=True)
    (knowledge_root / "scoped-storage.json").write_text(
        json.dumps({
            "schema": "eveos.knowledge.v1",
            "scopedStorage": dict((knowledge or {}).get("scopedStorage") or {}),
        }, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    bookmark_count = 0
    tab_count = 0
    card_count = 0

    for workspace_id, ws_data in workspace_map.items():
        ws_meta = ws_data["meta"]
        workspace_folder = tabs_dir / folder_name(
            f"{workspace_id}-{ws_meta.get('name', workspace_id)}", workspace_id
        )
        cards_root = workspace_folder / "cards"
        cards_root.mkdir(parents=True, exist_ok=True)

        tab_payload = _normalize_workspace_meta_record(
            ws_meta,
            fallback_id=workspace_id,
            fallback_name=ws_meta.get("name") or workspace_id,
            fallback_icon=ws_meta.get("icon") or "folder",
        )
        tab_payload.update({
            "schema": "eveos.tab.v1",
            "bookmarkCount": len(ws_data["links"]),
            "cardCount": len(ws_data["categories"]),
        })
        (workspace_folder / "tab.json").write_text(
            json.dumps(tab_payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        tab_count += 1

        for category_name, category_links in ws_data["categories"].items():
            card_folder_name = folder_name(category_name, "card")
            card_folder = cards_root / card_folder_name
            card_folder.mkdir(parents=True, exist_ok=True)

            bookmark_folder_name = "entries"
            bookmark_folder = card_folder / bookmark_folder_name
            bookmark_folder.mkdir(parents=True, exist_ok=True)

            scoped = scoped_key(workspace_id, category_name)
            scoped_library = library_index.get(scoped, {})
            data_type = scoped_library.get("data_type") or "graphicNovels"
            folder_tree = bookmark_folders.get(scoped) or {"nodes": []}
            folder_nodes = list(folder_tree.get("nodes") or [])
            folder_settings = normalize_bookmark_folder_tree_settings(folder_tree.get("settings"))
            folder_lookup = {
                str((node or {}).get("id") or "").strip(): normalize_bookmark_folder_node(node)
                for node in folder_nodes
                if str((node or {}).get("id") or "").strip()
            }
            folder_links = {}
            root_links = []
            for raw_link in category_links:
                link = dict(raw_link or {})
                folder_id = str(link.get("folderId") or "").strip()
                if folder_id and folder_id in folder_lookup:
                    folder_links.setdefault(folder_id, []).append(link)
                else:
                    link.pop("folderId", None)
                    root_links.append(link)
            children_by_parent = {}
            for node in folder_lookup.values():
                parent_id = str(node.get("parentId") or "").strip() or None
                if parent_id and parent_id not in folder_lookup:
                    parent_id = None
                    node["parentId"] = None
                children_by_parent.setdefault(parent_id, []).append(node)
            for child_list in children_by_parent.values():
                child_list.sort(
                    key=lambda item: (
                        int(item.get("order") or 0),
                        str(item.get("name") or "").lower(),
                        str(item.get("id") or ""),
                    )
                )

            card_payload = {
                "schema": "eveos.card.v2",
                "workspaceId": workspace_id,
                "categoryName": category_name,
                "title": category_name,
                "dataType": data_type,
                "libraryFolderView": normalize_library_folder_view(scoped_library.get("folder_view") or {}),
                "clickBehaviorMode": normalize_click_behavior_mode(folder_settings.get("clickBehaviorMode")),
                "bookmarkFolder": bookmark_folder_name,
                "bookmarkCount": len(category_links),
                "folderRoot": "folders",
                "folderCount": len(folder_lookup),
            }
            (card_folder / "card.json").write_text(
                json.dumps(card_payload, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            card_count += 1

            used_entry_ids = set()

            for link in root_links:
                link_id = str(link.get("id") or "").strip()
                conn = connections_by_link.get(link_id)
                linked_entry = None
                linked = False

                if conn:
                    entry_id = str(connection_entry_id(conn) or "").strip()
                    if entry_id:
                        used_entry_ids.add(entry_id)
                        linked_entry = (scoped_library.get("entries") or {}).get(entry_id)
                        if not linked_entry:
                            for candidate in library_index.values():
                                entry_map = candidate.get("entries") or {}
                                if entry_id in entry_map:
                                    linked_entry = entry_map[entry_id]
                                    break
                        linked = linked_entry is not None

                _write_bookmark_payload(bookmark_folder, link, category_name, conn, linked_entry)
                bookmark_count += 1

            bookmark_count += _write_bookmark_folder_branch(
                card_folder,
                children_by_parent,
                folder_links,
                workspace_id=workspace_id,
                category_name=category_name,
                connections_by_link=connections_by_link,
                scoped_library=scoped_library,
                library_index_values=library_index_values,
                used_entry_ids=used_entry_ids,
            )

            unlinked_entries = []
            for entry_id, entry in (scoped_library.get("entries") or {}).items():
                if entry_id in used_entry_ids or entry_id in connected_entry_ids:
                    continue
                unlinked_entries.append(entry)

            if unlinked_entries:
                unlinked_payload = {
                    "schema": "eveos.card-library-unlinked.v1",
                    "workspaceId": workspace_id,
                    "categoryName": category_name,
                    "entries": unlinked_entries,
                }
                (card_folder / "_library-unlinked.json").write_text(
                    json.dumps(unlinked_payload, ensure_ascii=False, indent=2), encoding="utf-8"
                )

    status = collect_status()
    return {
        "ok": True,
        "summary": {
            "tabs": tab_count,
            "cards": card_count,
            "bookmarks": bookmark_count,
        },
        "status": status,
    }


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
    configured_workspace_meta = {
        str((workspace or {}).get("id") or "").strip(): dict(workspace or {})
        for workspace in build_workspaces(config)
        if str((workspace or {}).get("id") or "").strip()
    }

    if tabs_dir.exists():
        for ws_folder in sorted(tabs_dir.iterdir()):
            if not ws_folder.is_dir():
                continue

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
            workspace_meta = _normalize_workspace_meta_record(
                {
                    **dict(configured_workspace_meta.get(workspace_id) or {}),
                    **dict(tab_data or {}),
                },
                fallback_id=workspace_id,
                fallback_name=workspace_name,
                fallback_icon=workspace_icon,
            )

            if workspace_id not in seen_workspace_ids:
                seen_workspace_ids.add(workspace_id)
                workspaces.append(workspace_meta)

            cards_root = ws_folder / "cards"
            ingest_cards_root(
                cards_root, workspace_id, categories, entry_ids_by_scope, bookmark_records, bookmark_folders
            )
    else:
        direct_cards_root = store_root / "cards"
        if direct_cards_root.exists() and direct_cards_root.is_dir():
            workspace_id = infer_workspace_from_cards_root(
                direct_cards_root, config=config, store_meta=store_meta
            )
            workspace_meta = next(
                (
                    ws
                    for ws in build_workspaces(config)
                    if str((ws or {}).get("id") or "").strip() == workspace_id
                ),
                None,
            )
            workspace_name = (workspace_meta or {}).get("name") or workspace_id
            workspace_icon = (workspace_meta or {}).get("icon") or "folder"
            normalized_workspace_meta = _normalize_workspace_meta_record(
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
