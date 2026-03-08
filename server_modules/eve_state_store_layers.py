import json
import os
import shutil
import time
from datetime import datetime
from pathlib import Path


FORMAT_VERSION = 1
VALID_LAYER_SCOPES = {"store", "tab", "card", "folder", "bookmark"}


def _to_number(value, default):
    try:
        return int(value)
    except Exception:
        return default


def _slugify(value, fallback="item"):
    text = str(value or "").strip().lower()
    text = "".join(ch if ch.isalnum() else "-" for ch in text)
    text = "-".join(part for part in text.split("-") if part)
    return text or fallback


def _parse_scoped_category_key(key):
    raw = str(key or "").strip()
    if not raw:
        return {"workspace_id": "main", "category_name": "Unsorted"}
    if "::" in raw:
        workspace_id, category_name = raw.split("::", 1)
        return {
            "workspace_id": str(workspace_id or "main").strip() or "main",
            "category_name": str(category_name or "Unsorted").strip() or "Unsorted"
        }
    return {"workspace_id": "main", "category_name": raw}


def _scoped_key(workspace_id, category_name):
    ws = str(workspace_id or "main").strip() or "main"
    cat = str(category_name or "Unsorted").strip() or "Unsorted"
    return f"{ws}::{cat}"


def _connection_category_name(conn):
    return conn.get("categoryName") or conn.get("category") or "Unsorted"


def _connection_entry_id(conn):
    return conn.get("libraryEntryId") or conn.get("entryId")


def _build_workspaces(config):
    workspaces = list((config or {}).get("workspaces") or [])
    if not workspaces:
        workspaces = [{"id": "main", "name": "Main", "icon": "🏠"}]
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
            "icon": (ws or {}).get("icon") or "📁"
        })
    return normalized


def _normalize_link_record(link, fallback_workspace="", fallback_category=""):
    item = dict(link or {})
    link_id = str(item.get("id") or "").strip()
    if not link_id:
        return None
    item["id"] = link_id
    item["workspace"] = str(item.get("workspace") or fallback_workspace or "main").strip() or "main"
    item["category"] = str(item.get("category") or fallback_category or "Unsorted").strip() or "Unsorted"
    return item


def _dedupe_links(links):
    deduped = {}
    for link in links or []:
        item = _normalize_link_record(link)
        if not item:
            continue
        link_id = item["id"]
        if link_id in deduped:
            deduped.pop(link_id)
        deduped[link_id] = item
    return list(deduped.values())


def _normalize_categories(categories):
    normalized = {}
    entry_ids_by_scope = {}

    for key, data in (categories or {}).items():
        parsed = _parse_scoped_category_key(key)
        workspace_id = str(parsed.get("workspace_id") or "main").strip() or "main"
        category_name = str(parsed.get("category_name") or "Unsorted").strip() or "Unsorted"
        scoped = _scoped_key(workspace_id, category_name)

        if scoped not in normalized:
            normalized[scoped] = {
                "dataType": (data or {}).get("dataType") or "graphicNovels",
                "entries": [],
                "folderView": {
                    "root": str(((data or {}).get("folderView") or {}).get("root") or "all").strip() or "all",
                    "chain": [
                        {"selection": str(step.get("selection") or "").strip()}
                        for step in (((data or {}).get("folderView") or {}).get("chain") or [])
                        if isinstance(step, dict) and str(step.get("selection") or "").strip()
                    ],
                    "expanded": bool(((data or {}).get("folderView") or {}).get("expanded")),
                }
            }
            entry_ids_by_scope[scoped] = set()

        if not normalized[scoped].get("dataType"):
            normalized[scoped]["dataType"] = (data or {}).get("dataType") or "graphicNovels"

        for entry in (data or {}).get("entries") or []:
            entry_obj = dict(entry or {})
            entry_id = str(entry_obj.get("id") or "").strip()
            if entry_id and entry_id in entry_ids_by_scope[scoped]:
                continue
            normalized[scoped]["entries"].append(entry_obj)
            if entry_id:
                entry_ids_by_scope[scoped].add(entry_id)

    return normalized


def _merge_entries(existing_entries, incoming_entries):
    merged = []
    by_id = {}
    for entry in existing_entries or []:
        item = dict(entry or {})
        entry_id = str(item.get("id") or "").strip()
        if entry_id:
            by_id[entry_id] = item
        else:
            merged.append(item)

    for entry in incoming_entries or []:
        item = dict(entry or {})
        entry_id = str(item.get("id") or "").strip()
        if entry_id:
            by_id[entry_id] = item
        else:
            merged.append(item)

    merged.extend(by_id.values())
    return merged


def _normalize_connections(connections, fallback_workspace="", fallback_category=""):
    deduped = {}
    for conn in connections or []:
        item = dict(conn or {})
        link_id = str(item.get("linkId") or "").strip()
        if not link_id:
            continue
        workspace_id = str(item.get("workspace") or fallback_workspace or "main").strip() or "main"
        category_name = str(_connection_category_name(item) or fallback_category or "Unsorted").strip() or "Unsorted"
        item["linkId"] = link_id
        item["workspace"] = workspace_id
        item["categoryName"] = category_name
        if not item.get("id"):
            item["id"] = f"conn-{link_id}"
        entry_id = _connection_entry_id(item)
        if entry_id and not item.get("libraryEntryId"):
            item["libraryEntryId"] = entry_id
        if link_id in deduped:
            deduped.pop(link_id)
        deduped[link_id] = item
    return list(deduped.values())


def _normalize_click_behavior_mode(value):
    normalized = str(value or "").strip().lower()
    return normalized if normalized in {
        "inherit",
        "invert",
        "focus_only",
        "open_and_focus",
        "open_only",
    } else "inherit"


def _normalize_task_mode(value):
    normalized = str(value or "").strip().lower()
    return normalized if normalized in {
        "inherit",
        "task",
        "non_task",
    } else "inherit"


def _normalize_folder_tree_settings(settings):
    source = settings if isinstance(settings, dict) else {}
    return {
        "clickBehaviorMode": _normalize_click_behavior_mode(source.get("clickBehaviorMode"))
    }


def _normalize_folder_node(node):
    item = dict(node or {})
    folder_id = str(item.get("id") or "").strip()
    parent_id = str(item.get("parentId") or "").strip()
    name = str(item.get("name") or item.get("title") or "").strip() or "Folder"
    try:
        order = int(item.get("order") or 0)
    except Exception:
        order = 0
    if not folder_id:
        folder_id = f"folder-{_slugify(f'{parent_id}-{name}-{order}', 'folder')}"
    return {
        "id": folder_id,
        "parentId": parent_id or None,
        "name": name,
        "order": order,
        "createdAt": str(item.get("createdAt") or "").strip(),
        "updatedAt": str(item.get("updatedAt") or "").strip(),
        "clickBehaviorMode": _normalize_click_behavior_mode(item.get("clickBehaviorMode")),
        "taskMode": _normalize_task_mode(item.get("taskMode")),
    }


def _normalize_bookmark_folders(folder_trees):
    normalized = {}
    for key, tree in (folder_trees or {}).items():
        parsed = _parse_scoped_category_key(key)
        scoped = _scoped_key(parsed["workspace_id"], parsed["category_name"])
        raw_nodes = []
        settings = _normalize_folder_tree_settings({})
        if isinstance(tree, dict):
            raw_nodes = list(tree.get("nodes") or [])
            settings = _normalize_folder_tree_settings(tree.get("settings") or tree)
        elif isinstance(tree, list):
            raw_nodes = list(tree)
        nodes = []
        seen_ids = set()
        for raw_node in raw_nodes:
            node = _normalize_folder_node(raw_node)
            if node["id"] in seen_ids:
                continue
            seen_ids.add(node["id"])
            nodes.append(node)
        valid_ids = {node["id"] for node in nodes}
        for node in nodes:
            parent_id = str(node.get("parentId") or "").strip()
            if not parent_id or parent_id == node["id"] or parent_id not in valid_ids:
                node["parentId"] = None
        nodes.sort(
            key=lambda item: (
                str(item.get("parentId") or ""),
                int(item.get("order") or 0),
                str(item.get("name") or "").lower(),
                str(item.get("id") or ""),
            )
        )
        if nodes or settings.get("clickBehaviorMode") != "inherit":
            normalized[scoped] = {
                "nodes": nodes,
                "settings": settings,
            }
    return normalized


def _normalize_single_folder_tree(tree):
    temp_key = "main::TempFolderTree"
    normalized = _normalize_bookmark_folders({temp_key: tree})
    return normalized.get(temp_key, {"nodes": [], "settings": _normalize_folder_tree_settings({})})


def _folder_nodes_for_tree(tree):
    if isinstance(tree, dict):
        return list(tree.get("nodes") or [])
    if isinstance(tree, list):
        return list(tree)
    return []


def _build_folder_tree_maps(tree):
    nodes = [_normalize_folder_node(node) for node in _folder_nodes_for_tree(tree)]
    node_by_id = {str(node.get("id") or ""): node for node in nodes if str(node.get("id") or "").strip()}
    children_by_parent = {}
    for node in nodes:
        parent_key = str(node.get("parentId") or "").strip() or "__root__"
        children_by_parent.setdefault(parent_key, []).append(node)
    for child_nodes in children_by_parent.values():
        child_nodes.sort(
            key=lambda item: (
                int(item.get("order") or 0),
                str(item.get("name") or "").lower(),
                str(item.get("id") or ""),
            )
        )
    return nodes, node_by_id, children_by_parent


def _collect_descendant_folder_ids(root_folder_id, children_by_parent):
    target_id = str(root_folder_id or "").strip()
    if not target_id:
        return set()
    pending = [target_id]
    collected = set()
    while pending:
        current_id = pending.pop()
        if current_id in collected:
            continue
        collected.add(current_id)
        for child in children_by_parent.get(current_id, []):
            child_id = str((child or {}).get("id") or "").strip()
            if child_id and child_id not in collected:
                pending.append(child_id)
    return collected


def _extract_folder_subtree(tree, root_folder_id):
    nodes, node_by_id, children_by_parent = _build_folder_tree_maps(tree)
    target_id = str(root_folder_id or "").strip()
    if target_id not in node_by_id:
        raise ValueError(f"Folder '{target_id}' not found in source state.")
    subtree_ids = _collect_descendant_folder_ids(target_id, children_by_parent)
    scoped_nodes = []
    for node in nodes:
        node_id = str(node.get("id") or "").strip()
        if node_id not in subtree_ids:
            continue
        next_node = dict(node)
        if node_id == target_id:
            next_node["parentId"] = None
        scoped_nodes.append(next_node)
    return {"nodes": scoped_nodes, "settings": _normalize_folder_tree_settings({})}


def _replace_folder_subtree(existing_tree, incoming_tree, target_folder_id):
    target_id = str(target_folder_id or "").strip()
    if not target_id:
        raise ValueError("folderId is required for folder import.")

    existing_nodes, existing_by_id, existing_children = _build_folder_tree_maps(existing_tree)
    incoming_nodes, incoming_by_id, _ = _build_folder_tree_maps(incoming_tree)
    if not incoming_nodes:
        raise ValueError("Incoming folder layer does not contain any folder nodes.")

    incoming_roots = [node for node in incoming_nodes if not str(node.get("parentId") or "").strip()]
    incoming_root = incoming_by_id.get(target_id) or (incoming_roots[0] if incoming_roots else None)
    if not incoming_root:
        raise ValueError("Incoming folder layer does not contain a root folder node.")

    source_root_id = str(incoming_root.get("id") or "").strip()
    if not source_root_id:
        raise ValueError("Incoming folder layer root is missing an id.")

    existing_target = existing_by_id.get(target_id)
    existing_parent_id = existing_target.get("parentId") if existing_target else None
    removed_ids = _collect_descendant_folder_ids(target_id, existing_children) if existing_target else set()

    remap = {}
    if source_root_id != target_id:
        remap[source_root_id] = target_id

    transformed_incoming = []
    incoming_ids = set()
    for raw_node in incoming_nodes:
        source_id = str(raw_node.get("id") or "").strip()
        source_parent_id = str(raw_node.get("parentId") or "").strip()
        next_id = remap.get(source_id, source_id)
        next_parent_id = remap.get(source_parent_id, source_parent_id) if source_parent_id else None
        next_node = dict(raw_node)
        next_node["id"] = next_id
        if source_id == source_root_id:
            next_node["parentId"] = existing_parent_id
        else:
            next_node["parentId"] = next_parent_id or None
        transformed_incoming.append(next_node)
        incoming_ids.add(next_id)

    merged_nodes = [
        dict(node)
        for node in existing_nodes
        if str(node.get("id") or "").strip() not in removed_ids
        and str(node.get("id") or "").strip() not in incoming_ids
    ]
    merged_nodes.extend(transformed_incoming)
    normalized_existing = _normalize_single_folder_tree(existing_tree)
    return _normalize_single_folder_tree({
        "nodes": merged_nodes,
        "settings": normalized_existing.get("settings") or _normalize_folder_tree_settings({}),
    })


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

    return {
        "metadata": dict(source.get("metadata") or {}),
        "bookmarks": {
            "links": links,
            "config": config,
            "folders": folders
        },
        "library": {
            "categories": categories,
            "connections": connections
        }
    }


def _categories_scope_workspace(scoped_key):
    parsed = _parse_scoped_category_key(scoped_key)
    return str(parsed.get("workspace_id") or "main").strip() or "main"


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


def _build_layer_state(
    links,
    config,
    folders,
    categories,
    connections,
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
            "folders": _normalize_bookmark_folders(folders or {})
        },
        "library": {
            "categories": {key: value for key, value in (categories or {}).items()},
            "connections": _normalize_connections(connections or [])
        }
    }


def empty_unified_state(format_version=FORMAT_VERSION):
    return {
        "metadata": {
            "version": format_version,
            "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "generator": "EveOS Modular State Loader"
        },
        "bookmarks": {
            "links": [],
            "config": {
                "workspaces": [{"id": "main", "name": "Main", "icon": "🏠"}],
                "activeWorkspace": "main"
            },
            "folders": {}
        },
        "library": {
            "categories": {},
            "connections": []
        }
    }


def build_gemini_summary(state, sample_limit=25):
    bookmarks = list((state or {}).get("bookmarks", {}).get("links") or [])
    categories = (state or {}).get("library", {}).get("categories") or {}
    connections = list((state or {}).get("library", {}).get("connections") or [])

    workspace_counts = {}
    category_counts = {}
    for link in bookmarks:
        workspace = str((link or {}).get("workspace") or "main")
        category = str((link or {}).get("category") or "Unsorted")
        workspace_counts[workspace] = workspace_counts.get(workspace, 0) + 1
        scoped = _scoped_key(workspace, category)
        category_counts[scoped] = category_counts.get(scoped, 0) + 1

    library_entry_count = 0
    status_counts = {}
    type_counts = {}
    library_samples = []

    for scoped_key, data in categories.items():
        parsed = _parse_scoped_category_key(scoped_key)
        entries = list((data or {}).get("entries") or [])
        data_type = (data or {}).get("dataType") or "graphicNovels"
        type_counts[data_type] = type_counts.get(data_type, 0) + len(entries)
        library_entry_count += len(entries)
        for entry in entries:
            status = str((entry or {}).get("status") or "Unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
            if len(library_samples) < sample_limit:
                library_samples.append({
                    "id": (entry or {}).get("id"),
                    "title": (entry or {}).get("title"),
                    "workspace": parsed["workspace_id"] or "main",
                    "category": parsed["category_name"],
                    "status": (entry or {}).get("status") or "",
                    "rating": (entry or {}).get("rating"),
                    "confidence": ((entry or {}).get("derivedRatings") or {}).get("confidence")
                })

    bookmark_samples = []
    for link in bookmarks[:sample_limit]:
        bookmark_samples.append({
            "id": (link or {}).get("id"),
            "title": (link or {}).get("title"),
            "url": (link or {}).get("url"),
            "workspace": (link or {}).get("workspace") or "main",
            "category": (link or {}).get("category") or "Unsorted",
            "done": bool((link or {}).get("done")),
            "pinned": bool((link or {}).get("pinned"))
        })

    return {
        "kind": "eveos_modular_summary",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "counts": {
            "bookmarks": len(bookmarks),
            "libraryEntries": library_entry_count,
            "connections": len(connections),
            "workspaces": len(workspace_counts),
            "cards": len(category_counts)
        },
        "breakdown": {
            "bookmarksByWorkspace": workspace_counts,
            "bookmarksByCard": category_counts,
            "libraryByStatus": status_counts,
            "libraryByDataType": type_counts
        },
        "samples": {
            "bookmarks": bookmark_samples,
            "libraryEntries": library_samples
        }
    }


def build_gemini_context_from_state(state, mode="summary", sample_limit=25):
    mode_value = str(mode or "summary").strip().lower()
    limit_value = max(5, min(200, _to_number(sample_limit, 25)))

    if mode_value == "full":
        payload = state
        header = (
            "[SYSTEM CONTEXT: EveOS modular state snapshot follows as JSON. "
            "Use it as reference context. Do not fabricate fields that are absent.]"
        )
    else:
        payload = build_gemini_summary(state, sample_limit=limit_value)
        header = (
            "[SYSTEM CONTEXT: EveOS modular state summary follows as JSON. "
            "Use it as reference context and prioritize explicit values.]"
        )

    payload_json = json.dumps(payload, ensure_ascii=False, indent=2)
    return {
        "mode": mode_value,
        "payload": payload,
        "contextText": f"{header}\n{payload_json}"
    }


def extract_layer_state(state, layer, workspace_id="", category_name="", folder_id="", bookmark_id="", format_version=FORMAT_VERSION):
    normalized = _normalize_state_payload(state)
    links = list(normalized["bookmarks"]["links"])
    config = dict(normalized["bookmarks"]["config"])
    folders = dict(normalized["bookmarks"].get("folders") or {})
    categories = dict(normalized["library"]["categories"])
    connections = list(normalized["library"]["connections"])

    scope = str(layer or "store").strip().lower()
    if scope not in VALID_LAYER_SCOPES:
        raise ValueError(f"Unsupported layer scope: {scope}")
    if scope == "store":
        return _build_layer_state(links, config, folders, categories, connections, "store", format_version=format_version)

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
        tab_config = dict(config)
        _ensure_workspace_config_entry(tab_config, ws_id, incoming_config=config)
        tab_config["workspaces"] = [
            ws for ws in _build_workspaces(tab_config)
            if str(ws.get("id")) == ws_id
        ] or [{"id": ws_id, "name": ws_id, "icon": "📁"}]
        return _build_layer_state(
            scoped_links,
            tab_config,
            scoped_folders,
            scoped_categories,
            scoped_connections,
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
        card_config = dict(config)
        _ensure_workspace_config_entry(card_config, ws_id, incoming_config=config)
        card_config["workspaces"] = [
            ws for ws in _build_workspaces(card_config)
            if str(ws.get("id")) == ws_id
        ] or [{"id": ws_id, "name": ws_id, "icon": "📁"}]
        return _build_layer_state(
            scoped_links,
            card_config,
            scoped_folders,
            scoped_categories,
            scoped_connections,
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

        folder_config = dict(config)
        _ensure_workspace_config_entry(folder_config, ws_id, incoming_config=config)
        folder_config["workspaces"] = [
            ws for ws in _build_workspaces(folder_config)
            if str(ws.get("id")) == ws_id
        ] or [{"id": ws_id, "name": ws_id, "icon": "ðŸ“"}]
        return _build_layer_state(
            scoped_links,
            folder_config,
            {scoped_key: scoped_folder_tree},
            scoped_categories,
            scoped_connections,
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

    bookmark_config = dict(config)
    _ensure_workspace_config_entry(bookmark_config, ws_from_link, incoming_config=config)
    bookmark_config["workspaces"] = [
        ws for ws in _build_workspaces(bookmark_config)
        if str(ws.get("id")) == ws_from_link
    ] or [{"id": ws_from_link, "name": ws_from_link, "icon": "📁"}]
    return _build_layer_state(
        [matched_link],
        bookmark_config,
        scoped_folders,
        scoped_categories,
        scoped_connections,
        "bookmark",
        workspace_id=ws_from_link,
        category_name=cat_from_link,
        bookmark_id=target_bookmark_id,
        format_version=format_version
    )


def merge_layer_state(base_state, incoming_state, layer, workspace_id="", category_name="", folder_id="", bookmark_id="", format_version=FORMAT_VERSION):
    base = _normalize_state_payload(base_state)
    incoming = _normalize_state_payload(incoming_state)
    scope = str(layer or "").strip().lower()
    if scope not in VALID_LAYER_SCOPES:
        raise ValueError(f"Unsupported layer scope: {scope}")

    if scope == "store":
        return _build_layer_state(
            incoming["bookmarks"]["links"],
            incoming["bookmarks"]["config"],
            incoming["bookmarks"].get("folders") or {},
            incoming["library"]["categories"],
            incoming["library"]["connections"],
            "store",
            format_version=format_version
        )

    base_links = list(base["bookmarks"]["links"])
    base_categories = dict(base["library"]["categories"])
    base_connections = list(base["library"]["connections"])
    base_config = dict(base["bookmarks"]["config"])
    base_folders = dict(base["bookmarks"].get("folders") or {})
    incoming_links = list(incoming["bookmarks"]["links"])
    incoming_categories = dict(incoming["library"]["categories"])
    incoming_connections = list(incoming["library"]["connections"])
    incoming_config = dict(incoming["bookmarks"]["config"])
    incoming_folders = dict(incoming["bookmarks"].get("folders") or {})

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
        _ensure_workspace_config_entry(base_config, ws_id, incoming_config=incoming_config)
        base_config["activeWorkspace"] = ws_id
        return _build_layer_state(
            base_links,
            base_config,
            base_folders,
            base_categories,
            base_connections,
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
        _ensure_workspace_config_entry(base_config, ws_id, incoming_config=incoming_config)
        base_config["activeWorkspace"] = ws_id
        return _build_layer_state(
            base_links,
            base_config,
            base_folders,
            base_categories,
            base_connections,
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

        _ensure_workspace_config_entry(base_config, ws_id, incoming_config=incoming_config)
        base_config["activeWorkspace"] = ws_id
        return _build_layer_state(
            base_links,
            base_config,
            base_folders,
            base_categories,
            base_connections,
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

    _ensure_workspace_config_entry(base_config, ws_from_link, incoming_config=incoming_config)
    base_config["activeWorkspace"] = ws_from_link
    return _build_layer_state(
        base_links,
        base_config,
        base_folders,
        base_categories,
        base_connections,
        "bookmark",
        workspace_id=ws_from_link,
        category_name=cat_from_link,
        bookmark_id=target_bookmark_id,
        format_version=format_version
    )


def _resolve_nonempty_path(path_value):
    raw = str(path_value or "").strip().strip('"')
    if not raw:
        raise ValueError("destinationPath is required for layer backup.")
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = Path(os.getcwd()) / path
    return path.resolve()


def default_backup_folder_name(layer):
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_layer = _slugify(layer or "layer", "layer")
    return f"{stamp}-{safe_layer}"


def resolve_destination_path(path_value):
    return _resolve_nonempty_path(path_value)


def build_unique_child_destination(parent_dir, layer):
    parent = Path(parent_dir).resolve()
    base_name = default_backup_folder_name(layer)
    candidate = parent / base_name
    counter = 1
    while candidate.exists():
        candidate = parent / f"{base_name}-{counter}"
        counter += 1
    return candidate


def ensure_destination_ready(destination, overwrite=False, layer="layer"):
    dest = Path(destination).resolve()
    if dest.exists() and not dest.is_dir():
        raise ValueError(f"Destination path is not a directory: {dest}")

    if overwrite:
        if dest.exists() and any(dest.iterdir()):
            shutil.rmtree(dest)
        dest.mkdir(parents=True, exist_ok=True)
        return dest

    dest.mkdir(parents=True, exist_ok=True)
    child = build_unique_child_destination(dest, layer)
    child.mkdir(parents=True, exist_ok=False)
    return child
