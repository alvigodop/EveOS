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
            "folders": {},
            "pins": []
        },
        "library": {
            "categories": {},
            "connections": []
        },
        "knowledge": {
            "scopedStorage": {}
        }
    }

def build_gemini_summary(state, sample_limit=25):
    metadata = (state or {}).get("metadata") or {}
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
        "scope": metadata.get("geminiScope") or {"scope": "all", "label": "Whole datapack"},
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

def _clone_json_compatible(value, fallback):
    try:
        return json.loads(json.dumps(value))
    except Exception:
        return fallback

def _normalize_scope_value(value):
    normalized = str(value or "").strip().lower()
    if normalized in {"all", "store", "datapack"}:
        return "all"
    if normalized in {"card", "category"}:
        return "card"
    return "workspace"

def _collect_workspace_branch_ids(workspace):
    ids = set()
    if not isinstance(workspace, dict):
        return ids
    workspace_id = str(workspace.get("id") or "").strip()
    if workspace_id:
        ids.add(workspace_id)
    for child in workspace.get("subTabs") or []:
        ids.update(_collect_workspace_branch_ids(child))
    return ids

def _filter_folders_for_scope(folders, allowed_workspace_ids, category_name=""):
    filtered = {}
    target_category = str(category_name or "").strip()
    for scoped_key, tree in (folders or {}).items():
        parsed = _parse_scoped_category_key(scoped_key)
        if parsed["workspace_id"] not in allowed_workspace_ids:
            continue
        if target_category and parsed["category_name"] != target_category:
            continue
        filtered[scoped_key] = _clone_json_compatible(tree, tree)
    return filtered

def _filter_categories_for_scope(categories, allowed_workspace_ids, category_name=""):
    filtered = {}
    target_category = str(category_name or "").strip()
    for scoped_key, data in (categories or {}).items():
        parsed = _parse_scoped_category_key(scoped_key)
        if parsed["workspace_id"] not in allowed_workspace_ids:
            continue
        if target_category and parsed["category_name"] != target_category:
            continue
        filtered[scoped_key] = _clone_json_compatible(data, data)
    return filtered

def _entry_ids_for_categories(categories):
    ids = set()
    for data in (categories or {}).values():
        for entry in (data or {}).get("entries") or []:
            entry_id = str((entry or {}).get("id") or "").strip()
            if entry_id:
                ids.add(entry_id)
    return ids

def _connection_matches_scope(conn, allowed_workspace_ids, link_ids, entry_ids, category_names):
    workspace_id = str((conn or {}).get("workspaceId") or (conn or {}).get("workspace") or "").strip()
    if workspace_id and workspace_id in allowed_workspace_ids:
        return True
    link_id = str((conn or {}).get("linkId") or (conn or {}).get("bookmarkId") or "").strip()
    if link_id and link_id in link_ids:
        return True
    entry_id = str(_connection_entry_id(conn) or "").strip()
    if entry_id and entry_id in entry_ids:
        return True
    parsed = _parse_scoped_category_key(_connection_category_name(conn or {}))
    if parsed["workspace_id"] in allowed_workspace_ids and parsed["category_name"] in category_names:
        return True
    return False

def _filter_pins_for_scope(pins, all_links, allowed_workspace_ids, category_name=""):
    target_category = str(category_name or "").strip()
    filtered = []
    for pin in pins or []:
        context = _pin_target_context(pin, links=all_links)
        if not context:
            continue
        if str(context.get("workspace_id") or "main").strip() not in allowed_workspace_ids:
            continue
        if target_category and str(context.get("category_name") or "Unsorted").strip() != target_category:
            continue
        filtered.append(_clone_json_compatible(pin, pin))
    return filtered

def _filter_state_for_gemini_scope(state, scope="workspace", workspace_id="", category_name=""):
    base = state if isinstance(state, dict) else {}
    scope_value = _normalize_scope_value(scope)
    if scope_value == "all":
        cloned = _clone_json_compatible(base, base)
        metadata = cloned.setdefault("metadata", {})
        metadata["geminiScope"] = {
            "scope": "all",
            "label": "Whole datapack",
            "source": "unidex-global"
        }
        return cloned

    bookmarks = base.get("bookmarks") if isinstance(base.get("bookmarks"), dict) else {}
    current_config = bookmarks.get("config") if isinstance(bookmarks.get("config"), dict) else {}
    all_workspaces = _build_workspaces(current_config)
    target_workspace_id = str(workspace_id or current_config.get("activeWorkspace") or "main").strip() or "main"
    target_workspace = _find_workspace_node(all_workspaces, target_workspace_id)
    allowed_workspace_ids = _collect_workspace_branch_ids(target_workspace) if target_workspace else {target_workspace_id}
    if not allowed_workspace_ids:
        allowed_workspace_ids = {target_workspace_id}

    target_category = str(category_name or "").strip() if scope_value == "card" else ""
    all_links = list(bookmarks.get("links") or [])
    scoped_links = [
        _clone_json_compatible(link, link)
        for link in all_links
        if str((link or {}).get("workspace") or "main").strip() in allowed_workspace_ids
        and (not target_category or str((link or {}).get("category") or "Unsorted").strip() == target_category)
    ]
    link_ids = {
        str((link or {}).get("id") or "").strip()
        for link in scoped_links
        if str((link or {}).get("id") or "").strip()
    }

    library = base.get("library") if isinstance(base.get("library"), dict) else {}
    scoped_categories = _filter_categories_for_scope(library.get("categories") or {}, allowed_workspace_ids, target_category)
    entry_ids = _entry_ids_for_categories(scoped_categories)
    category_names = {
        str((link or {}).get("category") or "Unsorted").strip() or "Unsorted"
        for link in scoped_links
    }
    category_names.update(
        _parse_scoped_category_key(scoped_key)["category_name"]
        for scoped_key in scoped_categories.keys()
    )
    scoped_connections = [
        _clone_json_compatible(conn, conn)
        for conn in (library.get("connections") or [])
        if _connection_matches_scope(conn, allowed_workspace_ids, link_ids, entry_ids, category_names)
    ]

    next_config = _clone_json_compatible(current_config, {})
    next_config["activeWorkspace"] = target_workspace_id
    next_config["workspaces"] = [_clone_workspace_node(target_workspace)] if target_workspace else _workspace_config_entries(current_config, target_workspace_id)

    scope_label = "Current card" if scope_value == "card" else "Current tab branch"
    scope_record = {
        "scope": scope_value,
        "label": scope_label,
        "workspaceId": target_workspace_id,
        "workspaceIds": sorted(allowed_workspace_ids),
        "categoryName": target_category,
        "source": "search-monitor"
    }

    metadata = _clone_json_compatible(base.get("metadata") or {}, {})
    metadata["geminiScope"] = scope_record

    return {
        "metadata": metadata,
        "bookmarks": {
            "links": scoped_links,
            "config": next_config,
            "folders": _filter_folders_for_scope(bookmarks.get("folders") or {}, allowed_workspace_ids, target_category),
            "pins": _filter_pins_for_scope(bookmarks.get("pins") or [], all_links, allowed_workspace_ids, target_category)
        },
        "library": {
            "categories": scoped_categories,
            "connections": scoped_connections
        },
        "knowledge": _filter_knowledge_state(base.get("knowledge") or {}, category_names)
    }

def build_gemini_context_from_state(state, mode="summary", sample_limit=25, scope="workspace", workspace_id="", category_name=""):
    mode_value = str(mode or "summary").strip().lower()
    limit_value = max(5, min(200, _to_number(sample_limit, 25)))
    scoped_state = _filter_state_for_gemini_scope(
        state,
        scope=scope,
        workspace_id=workspace_id,
        category_name=category_name,
    )

    if mode_value == "full":
        payload = scoped_state
        header = (
            "[SYSTEM CONTEXT: EveOS modular state snapshot follows as JSON. "
            "Use it as reference context. Do not fabricate fields that are absent.]"
        )
    else:
        payload = build_gemini_summary(scoped_state, sample_limit=limit_value)
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
