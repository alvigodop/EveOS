import json
import time

from server_modules.eve_state_store_files_folders import (
    build_bookmark_folder_dirname,
    normalize_bookmark_folder_node,
    normalize_bookmark_folder_tree_settings,
)
from server_modules.eve_state_store_files_shared import (
    build_bookmark_filename,
    connection_entry_id,
    folder_name,
    scoped_key,
)
from server_modules.eve_state_store_files_workspaces import (
    build_library_index,
    build_workspaces,
    normalize_library_folder_view,
    prepare_workspace_map,
)
from server_modules.eve_state_store_files_pins import (
    normalize_click_behavior_mode,
    normalize_quick_pins,
)
from server_modules.eve_state_store_io_shared import (
    normalize_bookmark_folders_map,
    normalize_workspace_meta_record,
)
from server_modules.eve_state_store_io_audioflix import write_audioflix_state


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
    bookmark_written_callback=None,
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
            if callable(bookmark_written_callback):
                bookmark_written_callback(
                    workspace_id=workspace_id,
                    category_name=category_name,
                    link=link,
                )

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
            bookmark_written_callback=bookmark_written_callback,
        )

    return written


def write_modular_state_full(
    state,
    *,
    store_root,
    meta_dir,
    tabs_dir,
    format_version,
    ensure_clean_store,
    collect_status,
    progress_callback=None,
):
    if not isinstance(state, dict):
        raise ValueError("State payload must be a JSON object.")

    bookmarks = state.get("bookmarks") or {}
    library = state.get("library") or {}
    config = dict(bookmarks.get("config") or {})
    config.pop("audioflix", None)
    links = list(bookmarks.get("links") or [])
    bookmark_folders = normalize_bookmark_folders_map(bookmarks.get("folders") or {})
    quick_pins = normalize_quick_pins(bookmarks.get("pins"), links=links)
    connections = list(library.get("connections") or [])
    categories = library.get("categories") or {}
    knowledge = state.get("knowledge") if isinstance(state.get("knowledge"), dict) else {"scopedStorage": {}}

    ensure_clean_store()
    write_audioflix_state(meta_dir, state)

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

    tab_count_total = len(workspace_map)
    card_count_total = sum(len((ws_data or {}).get("categories") or {}) for ws_data in workspace_map.values())
    bookmark_count_total = sum(len((ws_data or {}).get("links") or []) for ws_data in workspace_map.values())
    total_units = tab_count_total + card_count_total + bookmark_count_total

    bookmark_count = 0
    tab_count = 0
    card_count = 0

    def emit_progress(phase, message, *, workspace_id="", category_name="", current_item=""):
        if not callable(progress_callback):
            return
        progress_callback({
            "phase": str(phase or "writing").strip() or "writing",
            "message": str(message or "").strip(),
            "workspaceId": str(workspace_id or "").strip(),
            "categoryName": str(category_name or "").strip(),
            "currentItem": str(current_item or "").strip(),
            "tabsCompleted": tab_count,
            "tabsTotal": tab_count_total,
            "cardsCompleted": card_count,
            "cardsTotal": card_count_total,
            "bookmarksCompleted": bookmark_count,
            "bookmarksTotal": bookmark_count_total,
            "unitsCompleted": tab_count + card_count + bookmark_count,
            "unitsTotal": total_units,
        })

    def record_bookmark_written(*, workspace_id="", category_name="", link=None):
        nonlocal bookmark_count
        bookmark_count += 1
        link_title = str((link or {}).get("title") or "").strip()
        current_item = link_title or str((link or {}).get("id") or "").strip()
        emit_progress(
            "writing",
            f"Writing bookmarks for {category_name or 'Unsorted'}",
            workspace_id=workspace_id,
            category_name=category_name,
            current_item=current_item,
        )

    emit_progress("preparing", "Preparing modular data-pack save")

    written_workspace_ids = set()

    def write_workspace_branch(workspace_nodes, parent_tabs_dir):
        nonlocal tab_count, card_count
        for workspace_node in workspace_nodes or []:
            if not isinstance(workspace_node, dict):
                continue

            workspace_id = str((workspace_node or {}).get("id") or "").strip() or "main"
            ws_data = workspace_map.get(workspace_id) or {
                "meta": workspace_node,
                "links": [],
                "categories": {},
            }
            ws_meta = ws_data["meta"]
            workspace_folder = parent_tabs_dir / folder_name(
                f"{workspace_id}-{ws_meta.get('name', workspace_id)}", workspace_id
            )
            cards_root = workspace_folder / "cards"
            cards_root.mkdir(parents=True, exist_ok=True)

            tab_payload = normalize_workspace_meta_record(
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
            written_workspace_ids.add(workspace_id)
            tab_count += 1
            emit_progress(
                "writing",
                f"Writing tab {ws_meta.get('name') or workspace_id}",
                workspace_id=workspace_id,
                current_item=ws_meta.get("name") or workspace_id,
            )

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
                emit_progress(
                    "writing",
                    f"Writing card {category_name}",
                    workspace_id=workspace_id,
                    category_name=category_name,
                    current_item=category_name,
                )

                used_entry_ids = set()

                for link in root_links:
                    link_id = str(link.get("id") or "").strip()
                    conn = connections_by_link.get(link_id)
                    linked_entry = None

                    if conn:
                        entry_id = str(connection_entry_id(conn) or "").strip()
                        if entry_id:
                            used_entry_ids.add(entry_id)
                            linked_entry = (scoped_library.get("entries") or {}).get(entry_id)
                            if not linked_entry:
                                for candidate in library_index_values:
                                    entry_map = candidate.get("entries") or {}
                                    if entry_id in entry_map:
                                        linked_entry = entry_map[entry_id]
                                        break

                    _write_bookmark_payload(bookmark_folder, link, category_name, conn, linked_entry)
                    record_bookmark_written(
                        workspace_id=workspace_id,
                        category_name=category_name,
                        link=link,
                    )

                _write_bookmark_folder_branch(
                    card_folder,
                    children_by_parent,
                    folder_links,
                    workspace_id=workspace_id,
                    category_name=category_name,
                    connections_by_link=connections_by_link,
                    scoped_library=scoped_library,
                    library_index_values=library_index_values,
                    used_entry_ids=used_entry_ids,
                    bookmark_written_callback=record_bookmark_written,
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

            child_tabs = list(workspace_node.get("subTabs") or [])
            if child_tabs:
                child_tabs_root = workspace_folder / "tabs"
                child_tabs_root.mkdir(parents=True, exist_ok=True)
                write_workspace_branch(child_tabs, child_tabs_root)

    write_workspace_branch(workspaces, tabs_dir)

    orphan_workspace_ids = [
        workspace_id
        for workspace_id in workspace_map.keys()
        if workspace_id not in written_workspace_ids
    ]
    for workspace_id in sorted(orphan_workspace_ids):
        write_workspace_branch(
            [workspace_map.get(workspace_id, {}).get("meta") or {"id": workspace_id, "name": workspace_id, "icon": "folder", "subTabs": []}],
            tabs_dir,
        )
    emit_progress("finalizing", "Finalizing modular data-pack save")
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
