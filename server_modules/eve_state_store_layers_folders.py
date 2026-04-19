import json
import os
import shutil
import time
from datetime import datetime
from pathlib import Path

from server_modules.eve_state_store_layers_shared import (
    _normalize_click_behavior_mode,
    _normalize_task_mode,
    _parse_scoped_category_key,
    _scoped_key,
    _slugify,
)

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
