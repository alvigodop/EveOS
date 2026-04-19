import json
import os
import shutil
import time
from datetime import datetime
from pathlib import Path

FORMAT_VERSION = 1

VALID_LAYER_SCOPES = {"store", "tab", "card", "folder", "bookmark"}

KNOWLEDGE_STORAGE_KEYS = (
    "fandomDomains",
    "wikiEntries",
    "wikiCategories",
    "wikiDataStore",
    "wikiCacheStore",
    "apiSearchCachePool",
    "apiSearchPrefs",
)

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
        workspaces = [{"id": "main", "name": "Main", "icon": "🏠", "subTabs": []}]

    def normalize_workspace_node(node, seen_ids):
        if isinstance(node, str):
            node = {"id": node, "name": node, "icon": "📁", "subTabs": []}
        if not isinstance(node, dict):
            return None

        ws_id = str(node.get("id") or "").strip() or "main"
        if ws_id in seen_ids:
            return None
        seen_ids.add(ws_id)

        normalized_node = dict(node)
        normalized_node["id"] = ws_id
        normalized_node["name"] = node.get("name") or ws_id
        normalized_node["icon"] = node.get("icon") or "📁"
        normalized_node["subTabs"] = []

        for child in node.get("subTabs") or []:
            normalized_child = normalize_workspace_node(child, seen_ids)
            if normalized_child:
                normalized_node["subTabs"].append(normalized_child)

        return normalized_node

    normalized = []
    seen = set()
    for ws in workspaces:
        normalized_workspace = normalize_workspace_node(ws, seen)
        if normalized_workspace:
            normalized.append(normalized_workspace)

    if not normalized:
        normalized = [{"id": "main", "name": "Main", "icon": "🏠", "subTabs": []}]
    return normalized

def _iter_workspace_nodes(workspaces):
    for workspace in workspaces or []:
        if not isinstance(workspace, dict):
            continue
        yield workspace
        yield from _iter_workspace_nodes(workspace.get("subTabs") or [])

def _find_workspace_node(workspaces, workspace_id):
    target_id = str(workspace_id or "").strip()
    if not target_id:
        return None
    for workspace in _iter_workspace_nodes(workspaces):
        if str((workspace or {}).get("id") or "").strip() == target_id:
            return workspace
    return None

def _clone_workspace_node(node):
    workspace = dict(node or {})
    workspace["subTabs"] = [
        _clone_workspace_node(child)
        for child in (node or {}).get("subTabs") or []
        if isinstance(child, dict)
    ]
    return workspace

def _workspace_config_entries(config, workspace_id):
    match = _find_workspace_node(_build_workspaces(config), workspace_id)
    if match:
        return [_clone_workspace_node(match)]
    ws_id = str(workspace_id or "").strip() or "main"
    return [{"id": ws_id, "name": ws_id, "icon": "\U0001F4C1", "subTabs": []}]

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

def _categories_scope_workspace(scoped_key):
    parsed = _parse_scoped_category_key(scoped_key)
    return str(parsed.get("workspace_id") or "main").strip() or "main"
