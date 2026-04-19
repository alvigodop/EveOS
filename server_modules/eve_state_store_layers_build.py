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

def _normalize_state_payload(state):
    source = state if isinstance(state, dict) else {}
    config = dict((source.get("bookmarks") or {}).get("config") or {})
    workspaces = _build_workspaces(config)
    config["workspaces"] = workspaces
    config["activeWorkspace"] = str(config.get("activeWorkspace") or workspaces[0]["id"]).strip() or workspaces[0]["id"]

    links = []
    for raw in (source.get("bookmarks") or {}).get("links") or []:
        item = _normalize_link_record(raw, fallback_workspace=config["activeWorkspace"])
        if item:
            links.append(item)
    links = _dedupe_links(links)

    categories = _normalize_categories((source.get("library") or {}).get("categories") or {})
    connections = _normalize_connections((source.get("library") or {}).get("connections") or [])
    folders = _normalize_bookmark_folders((source.get("bookmarks") or {}).get("folders") or {})
    pins = _normalize_quick_pins((source.get("bookmarks") or {}).get("pins"), links=links)
    knowledge = _normalize_knowledge_state(source.get("knowledge") or {})

    return {
        "metadata": dict(source.get("metadata") or {}),
        "bookmarks": {
            "links": links,
            "config": config,
            "folders": folders,
            "pins": pins
        },
        "library": {
            "categories": categories,
            "connections": connections
        },
        "knowledge": knowledge
    }

def _ensure_workspace_config_entry(config, workspace_id, incoming_config=None):
    ws_id = str(workspace_id or "").strip() or "main"
    workspaces = _build_workspaces(config)
    if any(str((ws or {}).get("id") or "").strip() == ws_id for ws in workspaces):
        config["workspaces"] = workspaces
        return

    incoming_workspaces = _build_workspaces(incoming_config or {})
    match = next((ws for ws in incoming_workspaces if str(ws.get("id") or "").strip() == ws_id), None)
    workspaces.append(match or {"id": ws_id, "name": ws_id, "icon": "📁"})
    config["workspaces"] = workspaces

def _ensure_workspace_config_entry_recursive(config, workspace_id, incoming_config=None):
    ws_id = str(workspace_id or "").strip() or "main"
    workspaces = _build_workspaces(config)
    if _find_workspace_node(workspaces, ws_id):
        config["workspaces"] = workspaces
        return

    incoming_workspaces = _build_workspaces(incoming_config or {})
    match = _find_workspace_node(incoming_workspaces, ws_id)
    workspaces.append(
        _clone_workspace_node(match)
        if match
        else {"id": ws_id, "name": ws_id, "icon": "\U0001F4C1", "subTabs": []}
    )
    config["workspaces"] = workspaces

def _build_layer_state(
    links,
    config,
    folders,
    pins,
    categories,
    connections,
    knowledge,
    layer_type,
    workspace_id="",
    category_name="",
    folder_id="",
    bookmark_id="",
    format_version=FORMAT_VERSION,
):
    safe_config = dict(config or {})
    safe_workspaces = _build_workspaces(safe_config)
    safe_config["workspaces"] = safe_workspaces
    if workspace_id:
        safe_config["activeWorkspace"] = workspace_id
    elif safe_workspaces:
        safe_config["activeWorkspace"] = str(safe_config.get("activeWorkspace") or safe_workspaces[0]["id"]).strip() or safe_workspaces[0]["id"]

    metadata = {
        "version": format_version,
        "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "generator": "EveOS Modular Layer",
        "type": layer_type
    }
    if workspace_id:
        metadata["workspaceId"] = workspace_id
    if category_name:
        metadata["categoryName"] = category_name
    if folder_id:
        metadata["folderId"] = folder_id
    if bookmark_id:
        metadata["bookmarkId"] = bookmark_id

    return {
        "metadata": metadata,
        "bookmarks": {
            "links": _dedupe_links(links),
            "config": safe_config,
            "folders": _normalize_bookmark_folders(folders or {}),
            "pins": _normalize_quick_pins(pins, links=links)
        },
        "library": {
            "categories": {key: value for key, value in (categories or {}).items()},
            "connections": _normalize_connections(connections or [])
        },
        "knowledge": _normalize_knowledge_state(knowledge)
    }
