import json
import time

from server_modules.eve_state_store_layers_folders import (
    _build_folder_tree_maps,
    _collect_descendant_folder_ids,
    _extract_folder_subtree,
    _normalize_bookmark_folders,
    _replace_folder_subtree,
)
from server_modules.eve_state_store_layers_knowledge import (
    _filter_knowledge_state,
    _normalize_knowledge_state,
    _replace_knowledge_contexts,
)
from server_modules.eve_state_store_layers_pins import (
    _normalize_quick_pins,
    _pin_matches_card_scope,
    _pin_matches_folder_subtree,
    _pin_target_context,
)
from server_modules.eve_state_store_layers_shared import (
    FORMAT_VERSION,
    VALID_LAYER_SCOPES,
    _build_workspaces,
    _categories_scope_workspace,
    _clone_workspace_node,
    _connection_category_name,
    _connection_entry_id,
    _dedupe_links,
    _find_workspace_node,
    _merge_entries,
    _normalize_categories,
    _normalize_connections,
    _normalize_link_record,
    _parse_scoped_category_key,
    _scoped_key,
    _to_number,
    _workspace_config_entries,
)

from server_modules.eve_state_store_layers_build import (
    _build_layer_state,
    _ensure_workspace_config_entry,
    _ensure_workspace_config_entry_recursive,
    _normalize_state_payload,
)

def merge_layer_state(base_state, incoming_state, layer, workspace_id="", category_name="", folder_id="", bookmark_id="", format_version=FORMAT_VERSION):
    base = _normalize_state_payload(base_state)
    incoming = _normalize_state_payload(incoming_state)
    scope = str(layer or "").strip().lower()
    if scope not in VALID_LAYER_SCOPES:
        raise ValueError(f"Unsupported layer scope: {scope}")

    if scope == "store":
        result = _build_layer_state(
            incoming["bookmarks"]["links"],
            incoming["bookmarks"]["config"],
            incoming["bookmarks"].get("folders") or {},
            incoming["bookmarks"].get("pins") or [],
            incoming["library"]["categories"],
            incoming["library"]["connections"],
            incoming.get("knowledge") or {},
            "store",
            format_version=format_version
        )
        if "audioflix" in incoming:
            result["audioflix"] = dict(incoming["audioflix"])
        return result

    base_links = list(base["bookmarks"]["links"])
    base_categories = dict(base["library"]["categories"])
    base_connections = list(base["library"]["connections"])
    base_config = dict(base["bookmarks"]["config"])
    base_folders = dict(base["bookmarks"].get("folders") or {})
    base_pins = list(base["bookmarks"].get("pins") or [])
    base_knowledge = dict(base.get("knowledge") or {})
    incoming_links = list(incoming["bookmarks"]["links"])
    incoming_categories = dict(incoming["library"]["categories"])
    incoming_connections = list(incoming["library"]["connections"])
    incoming_config = dict(incoming["bookmarks"]["config"])
    incoming_folders = dict(incoming["bookmarks"].get("folders") or {})
    incoming_pins = list(incoming["bookmarks"].get("pins") or [])
    incoming_knowledge = dict(incoming.get("knowledge") or {})
    existing_links_for_pins = list(base_links)
    incoming_links_for_pins = list(incoming_links)

    ws_id = str(workspace_id or "").strip() or str(incoming_config.get("activeWorkspace") or "").strip()
    if scope in {"tab", "card", "folder", "bookmark"} and not ws_id:
        raise ValueError("workspaceId is required for import.")

    if scope == "tab":
        import_links = [link for link in incoming_links if str(link.get("workspace")) == ws_id]
        import_link_ids = {str(link.get("id")) for link in import_links}
        import_connections = [
            conn for conn in incoming_connections
            if str(conn.get("workspace")) == ws_id or str(conn.get("linkId")) in import_link_ids
        ]
        import_categories = {
            key: value for key, value in incoming_categories.items()
            if _categories_scope_workspace(key) == ws_id
        }

        base_links = [link for link in base_links if str(link.get("workspace")) != ws_id] + import_links
        base_connections = [
            conn for conn in base_connections
            if str(conn.get("workspace")) != ws_id and str(conn.get("linkId")) not in import_link_ids
        ] + import_connections
        base_categories = {
            key: value for key, value in base_categories.items()
            if _categories_scope_workspace(key) != ws_id
        }
        base_categories.update(import_categories)
        base_folders = {
            key: value for key, value in base_folders.items()
            if _categories_scope_workspace(key) != ws_id
        }
        base_folders.update({
            key: value for key, value in incoming_folders.items()
            if _categories_scope_workspace(key) == ws_id
        })
        base_pins = [
            pin for pin in base_pins
            if str((_pin_target_context(pin, links=existing_links_for_pins) or {}).get("workspace_id") or "main").strip() != ws_id
        ] + [
            pin for pin in incoming_pins
            if str((_pin_target_context(pin, links=incoming_links_for_pins) or {}).get("workspace_id") or "main").strip() == ws_id
        ]
        tab_category_names = [
            parsed.get("category_name")
            for parsed in map(_parse_scoped_category_key, import_categories.keys())
        ]
        base_knowledge = _replace_knowledge_contexts(base_knowledge, incoming_knowledge, tab_category_names)
        _ensure_workspace_config_entry_recursive(base_config, ws_id, incoming_config=incoming_config)
        base_config["activeWorkspace"] = ws_id
        return _build_layer_state(
            base_links,
            base_config,
            base_folders,
            base_pins,
            base_categories,
            base_connections,
            base_knowledge,
            "workspace",
            workspace_id=ws_id,
            format_version=format_version
        )

    cat_name = str(category_name or "").strip()
    if scope in {"card", "folder", "bookmark"} and not cat_name:
        raise ValueError("categoryName is required for card/folder/bookmark import.")

    if scope == "card":
        import_links = [
            link for link in incoming_links
            if str(link.get("workspace")) == ws_id and str(link.get("category") or "Unsorted") == cat_name
        ]
        import_link_ids = {str(link.get("id")) for link in import_links}
        import_connections = [
            conn for conn in incoming_connections
            if (
                str(conn.get("workspace")) == ws_id
                and str(_connection_category_name(conn) or "Unsorted") == cat_name
            ) or str(conn.get("linkId")) in import_link_ids
        ]
        target_scoped_key = _scoped_key(ws_id, cat_name)
        import_categories = {
            key: value for key, value in incoming_categories.items()
            if key == target_scoped_key
        }

        base_links = [
            link for link in base_links
            if not (
                str(link.get("workspace")) == ws_id
                and str(link.get("category") or "Unsorted") == cat_name
            )
        ] + import_links
        base_connections = [
            conn for conn in base_connections
            if not (
                str(conn.get("workspace")) == ws_id
                and str(_connection_category_name(conn) or "Unsorted") == cat_name
            ) and str(conn.get("linkId")) not in import_link_ids
        ] + import_connections
        if target_scoped_key in base_categories:
            base_categories.pop(target_scoped_key)
        base_categories.update(import_categories)
        if target_scoped_key in base_folders:
            base_folders.pop(target_scoped_key)
        if target_scoped_key in incoming_folders:
            base_folders[target_scoped_key] = incoming_folders[target_scoped_key]
        base_pins = [
            pin for pin in base_pins
            if not _pin_matches_card_scope(pin, ws_id, cat_name, links=existing_links_for_pins)
        ] + [
            pin for pin in incoming_pins
            if _pin_matches_card_scope(pin, ws_id, cat_name, links=incoming_links_for_pins)
        ]
        base_knowledge = _replace_knowledge_contexts(base_knowledge, incoming_knowledge, [cat_name])
        _ensure_workspace_config_entry_recursive(base_config, ws_id, incoming_config=incoming_config)
        base_config["activeWorkspace"] = ws_id
        return _build_layer_state(
            base_links,
            base_config,
            base_folders,
            base_pins,
            base_categories,
            base_connections,
            base_knowledge,
            "card",
            workspace_id=ws_id,
            category_name=cat_name,
            format_version=format_version
        )

    if scope == "folder":
        target_folder_id = str(folder_id or "").strip()
        if not target_folder_id:
            raise ValueError("folderId is required for folder import.")

        scoped_key = _scoped_key(ws_id, cat_name)
        incoming_tree = incoming_folders.get(scoped_key)
        if not incoming_tree:
            raise ValueError("Incoming folder layer does not contain the selected card folder tree.")

        existing_tree = base_folders.get(scoped_key) or {"nodes": []}
        existing_nodes, _, existing_children = _build_folder_tree_maps(existing_tree)
        removed_ids = _collect_descendant_folder_ids(target_folder_id, existing_children)
        removed_link_ids = {
            str(link.get("id") or "").strip()
            for link in base_links
            if str(link.get("workspace")) == ws_id
            and str(link.get("category") or "Unsorted") == cat_name
            and str(link.get("folderId") or "").strip() in removed_ids
        }

        import_links = [
            link for link in incoming_links
            if str(link.get("workspace")) == ws_id
            and str(link.get("category") or "Unsorted") == cat_name
        ]
        import_link_ids = {str(link.get("id")) for link in import_links}
        import_connections = [
            conn for conn in incoming_connections
            if str(conn.get("linkId")) in import_link_ids
        ]

        base_links = [
            link for link in base_links
            if not (
                str(link.get("workspace")) == ws_id
                and str(link.get("category") or "Unsorted") == cat_name
                and (
                    str(link.get("folderId") or "").strip() in removed_ids
                    or str(link.get("id") or "").strip() in import_link_ids
                )
            )
            and str(link.get("id") or "").strip() not in import_link_ids
        ] + import_links
        base_connections = [
            conn for conn in base_connections
            if str(conn.get("linkId") or "").strip() not in removed_link_ids
            and str(conn.get("linkId") or "").strip() not in import_link_ids
        ] + import_connections

        merged_tree = _replace_folder_subtree(existing_tree, incoming_tree, target_folder_id)
        base_folders[scoped_key] = merged_tree
        base_pins = [
            pin for pin in base_pins
            if not _pin_matches_folder_subtree(pin, ws_id, cat_name, removed_ids, links=existing_links_for_pins)
        ] + list(incoming_pins)
        base_knowledge = _replace_knowledge_contexts(base_knowledge, incoming_knowledge, [cat_name])

        entry_ids = {
            str(_connection_entry_id(conn) or "").strip()
            for conn in import_connections
            if str(_connection_entry_id(conn) or "").strip()
        }
        existing_category = base_categories.get(scoped_key) or {}
        incoming_category = incoming_categories.get(scoped_key) or {}
        incoming_entries = [
            entry for entry in (incoming_category.get("entries") or [])
            if str((entry or {}).get("id") or "").strip() in entry_ids
        ]
        base_categories[scoped_key] = {
            "dataType": existing_category.get("dataType") or incoming_category.get("dataType") or "graphicNovels",
            "entries": _merge_entries(existing_category.get("entries") or [], incoming_entries),
            "folderView": dict(existing_category.get("folderView") or incoming_category.get("folderView") or {}),
        }

        _ensure_workspace_config_entry_recursive(base_config, ws_id, incoming_config=incoming_config)
        base_config["activeWorkspace"] = ws_id
        return _build_layer_state(
            base_links,
            base_config,
            base_folders,
            base_pins,
            base_categories,
            base_connections,
            base_knowledge,
            "folder",
            workspace_id=ws_id,
            category_name=cat_name,
            folder_id=target_folder_id,
            format_version=format_version
        )

    target_bookmark_id = str(bookmark_id or "").strip()
    if not target_bookmark_id:
        raise ValueError("bookmarkId is required for bookmark import.")

    import_link = next((link for link in incoming_links if str(link.get("id")) == target_bookmark_id), None)
    if not import_link:
        raise ValueError(f"Bookmark '{target_bookmark_id}' was not found in import layer.")
    ws_from_link = str(import_link.get("workspace") or ws_id).strip() or ws_id
    cat_from_link = str(import_link.get("category") or cat_name).strip() or cat_name
    import_connections = [conn for conn in incoming_connections if str(conn.get("linkId")) == target_bookmark_id]

    base_links = [link for link in base_links if str(link.get("id")) != target_bookmark_id] + [import_link]
    base_connections = [conn for conn in base_connections if str(conn.get("linkId")) != target_bookmark_id] + import_connections

    entry_ids = {
        str(_connection_entry_id(conn) or "").strip()
        for conn in import_connections
        if str(_connection_entry_id(conn) or "").strip()
    }
    scoped_key = _scoped_key(ws_from_link, cat_from_link)
    if scoped_key in incoming_categories and entry_ids:
        existing_data = base_categories.get(scoped_key) or {"dataType": "graphicNovels", "entries": [], "folderView": {}}
        incoming_entries = [
            entry for entry in (incoming_categories.get(scoped_key) or {}).get("entries") or []
            if str((entry or {}).get("id") or "").strip() in entry_ids
        ]
        base_categories[scoped_key] = {
            "dataType": existing_data.get("dataType") or (incoming_categories.get(scoped_key) or {}).get("dataType") or "graphicNovels",
            "entries": _merge_entries(existing_data.get("entries") or [], incoming_entries),
            "folderView": dict(existing_data.get("folderView") or (incoming_categories.get(scoped_key) or {}).get("folderView") or {}),
        }
    if scoped_key in incoming_folders:
        base_folders[scoped_key] = incoming_folders[scoped_key]
    base_pins = [
        pin for pin in base_pins
        if not (
            str((pin or {}).get("targetType") or "").strip().lower() == "bookmark"
            and str((pin or {}).get("targetId") or "").strip() == target_bookmark_id
        )
    ] + [
        pin for pin in incoming_pins
        if (
            str((pin or {}).get("targetType") or "").strip().lower() == "bookmark"
            and str((pin or {}).get("targetId") or "").strip() == target_bookmark_id
        )
    ]
    base_knowledge = _replace_knowledge_contexts(base_knowledge, incoming_knowledge, [cat_from_link])

    _ensure_workspace_config_entry_recursive(base_config, ws_from_link, incoming_config=incoming_config)
    base_config["activeWorkspace"] = ws_from_link
    return _build_layer_state(
        base_links,
        base_config,
        base_folders,
        base_pins,
        base_categories,
        base_connections,
        base_knowledge,
        "bookmark",
        workspace_id=ws_from_link,
        category_name=cat_from_link,
        bookmark_id=target_bookmark_id,
        format_version=format_version
    )
