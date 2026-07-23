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

def extract_layer_state(state, layer, workspace_id="", category_name="", folder_id="", bookmark_id="", format_version=FORMAT_VERSION):
    normalized = _normalize_state_payload(state)
    links = list(normalized["bookmarks"]["links"])
    config = dict(normalized["bookmarks"]["config"])
    folders = dict(normalized["bookmarks"].get("folders") or {})
    pins = list(normalized["bookmarks"].get("pins") or [])
    categories = dict(normalized["library"]["categories"])
    connections = list(normalized["library"]["connections"])
    knowledge = dict(normalized.get("knowledge") or {})

    scope = str(layer or "store").strip().lower()
    if scope not in VALID_LAYER_SCOPES:
        raise ValueError(f"Unsupported layer scope: {scope}")
    if scope == "store":
        result = _build_layer_state(links, config, folders, pins, categories, connections, knowledge, "store", format_version=format_version)
        if "audioflix" in normalized:
            result["audioflix"] = dict(normalized["audioflix"])
        return result

    ws_id = str(workspace_id or "").strip() or str(config.get("activeWorkspace") or "").strip()
    if scope in {"tab", "card", "folder", "bookmark"} and not ws_id:
        raise ValueError("workspaceId is required for the selected layer scope.")

    if scope == "tab":
        scoped_links = [link for link in links if str(link.get("workspace")) == ws_id]
        scoped_link_ids = {str(link.get("id")) for link in scoped_links}
        scoped_connections = [
            conn for conn in connections
            if str(conn.get("workspace")) == ws_id or str(conn.get("linkId")) in scoped_link_ids
        ]
        scoped_categories = {
            key: value for key, value in categories.items()
            if _categories_scope_workspace(key) == ws_id
        }
        scoped_folders = {
            key: value for key, value in folders.items()
            if _categories_scope_workspace(key) == ws_id
        }
        scoped_pins = [
            pin for pin in pins
            if str((_pin_target_context(pin, links=links) or {}).get("workspace_id") or "main").strip() == ws_id
        ]
        scoped_category_names = [parsed.get("category_name") for parsed in map(_parse_scoped_category_key, scoped_categories.keys())]
        tab_config = dict(config)
        _ensure_workspace_config_entry_recursive(tab_config, ws_id, incoming_config=config)
        tab_config["workspaces"] = [
            ws for ws in _build_workspaces(tab_config)
            if str(ws.get("id")) == ws_id
        ] or [{"id": ws_id, "name": ws_id, "icon": "📁"}]
        tab_config["workspaces"] = _workspace_config_entries(tab_config, ws_id)
        return _build_layer_state(
            scoped_links,
            tab_config,
            scoped_folders,
            scoped_pins,
            scoped_categories,
            scoped_connections,
            _filter_knowledge_state(knowledge, scoped_category_names),
            "workspace",
            workspace_id=ws_id,
            format_version=format_version
        )

    cat_name = str(category_name or "").strip()
    if scope in {"card", "folder", "bookmark"} and not cat_name:
        raise ValueError("categoryName is required for card/folder/bookmark layer scope.")

    if scope == "card":
        scoped_links = [
            link for link in links
            if str(link.get("workspace")) == ws_id and str(link.get("category") or "Unsorted") == cat_name
        ]
        scoped_link_ids = {str(link.get("id")) for link in scoped_links}
        scoped_connections = [
            conn for conn in connections
            if (
                str(conn.get("workspace")) == ws_id
                and str(_connection_category_name(conn) or "Unsorted") == cat_name
            ) or str(conn.get("linkId")) in scoped_link_ids
        ]
        scoped_key = _scoped_key(ws_id, cat_name)
        scoped_categories = {scoped_key: categories.get(scoped_key)} if scoped_key in categories else {}
        scoped_folders = {scoped_key: folders.get(scoped_key)} if scoped_key in folders else {}
        scoped_pins = [
            pin for pin in pins
            if _pin_matches_card_scope(pin, ws_id, cat_name, links=links)
        ]
        card_config = dict(config)
        _ensure_workspace_config_entry_recursive(card_config, ws_id, incoming_config=config)
        card_config["workspaces"] = [
            ws for ws in _build_workspaces(card_config)
            if str(ws.get("id")) == ws_id
        ] or [{"id": ws_id, "name": ws_id, "icon": "📁"}]
        card_config["workspaces"] = _workspace_config_entries(card_config, ws_id)
        return _build_layer_state(
            scoped_links,
            card_config,
            scoped_folders,
            scoped_pins,
            scoped_categories,
            scoped_connections,
            _filter_knowledge_state(knowledge, [cat_name]),
            "card",
            workspace_id=ws_id,
            category_name=cat_name,
            format_version=format_version
        )

    if scope == "folder":
        target_folder_id = str(folder_id or "").strip()
        if not target_folder_id:
            raise ValueError("folderId is required for folder layer scope.")

        scoped_key = _scoped_key(ws_id, cat_name)
        if scoped_key not in folders:
            raise ValueError(f"Folder '{target_folder_id}' not found in source state.")

        scoped_folder_tree = _extract_folder_subtree(folders.get(scoped_key), target_folder_id)
        folder_nodes, _, children_by_parent = _build_folder_tree_maps(scoped_folder_tree)
        subtree_ids = _collect_descendant_folder_ids(target_folder_id, children_by_parent)
        if not subtree_ids:
            raise ValueError(f"Folder '{target_folder_id}' not found in source state.")

        scoped_links = [
            link for link in links
            if str(link.get("workspace")) == ws_id
            and str(link.get("category") or "Unsorted") == cat_name
            and str(link.get("folderId") or "").strip() in subtree_ids
        ]
        scoped_link_ids = {str(link.get("id")) for link in scoped_links}
        scoped_connections = [
            conn for conn in connections
            if str(conn.get("linkId")) in scoped_link_ids
        ]
        entry_ids = {
            str(_connection_entry_id(conn) or "").strip()
            for conn in scoped_connections
            if str(_connection_entry_id(conn) or "").strip()
        }
        scoped_categories = {}
        if scoped_key in categories:
            source_category = categories.get(scoped_key) or {}
            source_entries = source_category.get("entries") or []
            scoped_categories[scoped_key] = {
                "dataType": source_category.get("dataType") or "graphicNovels",
                "entries": [
                    entry for entry in source_entries
                    if str((entry or {}).get("id") or "").strip() in entry_ids
                ],
                "folderView": dict(source_category.get("folderView") or {})
            }
        scoped_pins = [
            pin for pin in pins
            if _pin_matches_folder_subtree(pin, ws_id, cat_name, subtree_ids, links=links)
        ]

        folder_config = dict(config)
        _ensure_workspace_config_entry_recursive(folder_config, ws_id, incoming_config=config)
        folder_config["workspaces"] = [
            ws for ws in _build_workspaces(folder_config)
            if str(ws.get("id")) == ws_id
        ] or [{"id": ws_id, "name": ws_id, "icon": "\U0001f4c1"}]
        folder_config["workspaces"] = _workspace_config_entries(folder_config, ws_id)
        return _build_layer_state(
            scoped_links,
            folder_config,
            {scoped_key: scoped_folder_tree},
            scoped_pins,
            scoped_categories,
            scoped_connections,
            _filter_knowledge_state(knowledge, [cat_name]),
            "folder",
            workspace_id=ws_id,
            category_name=cat_name,
            folder_id=target_folder_id,
            format_version=format_version
        )

    target_bookmark_id = str(bookmark_id or "").strip()
    if not target_bookmark_id:
        raise ValueError("bookmarkId is required for bookmark layer scope.")

    matched_link = next((link for link in links if str(link.get("id")) == target_bookmark_id), None)
    if not matched_link:
        raise ValueError(f"Bookmark '{target_bookmark_id}' not found in source state.")

    ws_from_link = str(matched_link.get("workspace") or ws_id).strip() or ws_id
    cat_from_link = str(matched_link.get("category") or cat_name).strip() or cat_name
    scoped_connections = [conn for conn in connections if str(conn.get("linkId")) == target_bookmark_id]
    entry_ids = {
        str(_connection_entry_id(conn) or "").strip()
        for conn in scoped_connections
        if str(_connection_entry_id(conn) or "").strip()
    }
    scoped_key = _scoped_key(ws_from_link, cat_from_link)
    scoped_categories = {}
    if scoped_key in categories and entry_ids:
        source_entries = (categories.get(scoped_key) or {}).get("entries") or []
        scoped_categories[scoped_key] = {
            "dataType": (categories.get(scoped_key) or {}).get("dataType") or "graphicNovels",
            "folderView": dict((categories.get(scoped_key) or {}).get("folderView") or {}),
            "entries": [
                entry for entry in source_entries
                if str((entry or {}).get("id") or "").strip() in entry_ids
            ]
    }
    scoped_folders = {scoped_key: folders.get(scoped_key)} if scoped_key in folders else {}
    scoped_pins = [
        pin for pin in pins
        if str((pin or {}).get("targetType") or "").strip().lower() == "bookmark"
        and str((pin or {}).get("targetId") or "").strip() == target_bookmark_id
    ]

    bookmark_config = dict(config)
    _ensure_workspace_config_entry_recursive(bookmark_config, ws_from_link, incoming_config=config)
    bookmark_config["workspaces"] = [
        ws for ws in _build_workspaces(bookmark_config)
        if str(ws.get("id")) == ws_from_link
    ] or [{"id": ws_from_link, "name": ws_from_link, "icon": "📁"}]
    bookmark_config["workspaces"] = _workspace_config_entries(bookmark_config, ws_from_link)
    return _build_layer_state(
        [matched_link],
        bookmark_config,
        scoped_folders,
        scoped_pins,
        scoped_categories,
        scoped_connections,
        _filter_knowledge_state(knowledge, [cat_from_link]),
        "bookmark",
        workspace_id=ws_from_link,
        category_name=cat_from_link,
        bookmark_id=target_bookmark_id,
        format_version=format_version
    )
