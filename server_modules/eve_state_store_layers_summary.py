import json
import time

from server_modules.eve_state_store_gemini_structure import _prune_empty_deep
from server_modules.eve_state_store_gemini_summary import (
    _summary_text,
    build_gemini_summary,
)
from server_modules.eve_state_store_layers_knowledge import _filter_knowledge_state
from server_modules.eve_state_store_layers_pins import _pin_target_context
from server_modules.eve_state_store_layers_shared import (
    FORMAT_VERSION,
    _build_workspaces,
    _clone_workspace_node,
    _connection_category_name,
    _connection_entry_id,
    _find_workspace_node,
    _parse_scoped_category_key,
    _to_number,
    _workspace_config_entries,
)


def empty_unified_state(format_version=FORMAT_VERSION):
    return {
        "metadata": {
            "version": format_version,
            "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "generator": "EveOS Modular State Loader",
        },
        "bookmarks": {
            "links": [],
            "config": {
                "workspaces": [{"id": "main", "name": "Main", "icon": "ðŸ "}],
                "activeWorkspace": "main",
            },
            "folders": {},
            "pins": [],
        },
        "library": {
            "categories": {},
            "connections": [],
        },
        "knowledge": {
            "scopedStorage": {},
        },
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
    return parsed["workspace_id"] in allowed_workspace_ids and parsed["category_name"] in category_names


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


def _parse_workspace_ids(value):
    source = value if isinstance(value, (list, tuple, set)) else str(value or "").split(",")
    return {_summary_text(item) for item in source if _summary_text(item)}


def _filter_state_for_gemini_scope(state, scope="workspace", workspace_id="", category_name="", workspace_ids=None):
    base = state if isinstance(state, dict) else {}
    scope_value = _normalize_scope_value(scope)
    explicit_workspace_ids = _parse_workspace_ids(workspace_ids)
    if scope_value == "all" and not explicit_workspace_ids:
        cloned = _clone_json_compatible(base, base)
        cloned.setdefault("metadata", {})["geminiScope"] = {
            "scope": "all",
            "label": "Whole datapack",
            "source": "unidex-global",
        }
        return cloned

    bookmarks = base.get("bookmarks") if isinstance(base.get("bookmarks"), dict) else {}
    current_config = bookmarks.get("config") if isinstance(bookmarks.get("config"), dict) else {}
    all_workspaces = _build_workspaces(current_config)
    target_workspace_id = str(workspace_id or current_config.get("activeWorkspace") or "main").strip() or "main"
    target_workspace = _find_workspace_node(all_workspaces, target_workspace_id)
    allowed_workspace_ids = set(explicit_workspace_ids) if explicit_workspace_ids else (
        _collect_workspace_branch_ids(target_workspace) if target_workspace else {target_workspace_id}
    )
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
    category_names = {str((link or {}).get("category") or "Unsorted").strip() or "Unsorted" for link in scoped_links}
    category_names.update(_parse_scoped_category_key(scoped_key)["category_name"] for scoped_key in scoped_categories.keys())
    scoped_connections = [
        _clone_json_compatible(conn, conn)
        for conn in (library.get("connections") or [])
        if _connection_matches_scope(conn, allowed_workspace_ids, link_ids, entry_ids, category_names)
    ]

    next_config = _clone_json_compatible(current_config, {})
    next_config["activeWorkspace"] = target_workspace_id
    if explicit_workspace_ids:
        # Keep only ROOT nodes of the selection: a selected workspace whose ancestor is also
        # selected already ships nested inside that ancestor's subTabs — listing it again at top
        # level duplicated its whole subtree in the workspaces context.
        selected_nodes = [
            (workspace_id_item, workspace)
            for workspace_id_item in sorted(explicit_workspace_ids)
            for workspace in [_find_workspace_node(all_workspaces, workspace_id_item)]
            if workspace
        ]
        descendant_ids = set()
        for _node_id, node in selected_nodes:
            branch = _collect_workspace_branch_ids(node)
            branch.discard(_node_id)
            descendant_ids.update(branch)
        next_config["workspaces"] = [
            _clone_workspace_node(node)
            for node_id, node in selected_nodes
            if node_id not in descendant_ids
        ] or _workspace_config_entries(current_config, target_workspace_id)
    else:
        next_config["workspaces"] = [_clone_workspace_node(target_workspace)] if target_workspace else _workspace_config_entries(current_config, target_workspace_id)

    if scope_value == "card":
        scope_label = "Specific card"
    elif explicit_workspace_ids and len(allowed_workspace_ids) <= 1:
        scope_label = "Current tab only"
    elif explicit_workspace_ids and scope_value == "all":
        scope_label = "Selected tab group"
    else:
        scope_label = "Current tab branch"
    metadata = _clone_json_compatible(base.get("metadata") or {}, {})
    metadata["geminiScope"] = {
        "scope": scope_value,
        "label": scope_label,
        "workspaceId": target_workspace_id,
        "workspaceIds": sorted(allowed_workspace_ids),
        "categoryName": target_category,
        "source": "search-monitor",
    }

    return {
        "metadata": metadata,
        "bookmarks": {
            "links": scoped_links,
            "config": next_config,
            "folders": _filter_folders_for_scope(bookmarks.get("folders") or {}, allowed_workspace_ids, target_category),
            "pins": _filter_pins_for_scope(bookmarks.get("pins") or [], all_links, allowed_workspace_ids, target_category),
        },
        "library": {
            "categories": scoped_categories,
            "connections": scoped_connections,
        },
        "knowledge": _filter_knowledge_state(base.get("knowledge") or {}, category_names),
    }


CONTEXT_MODE_PROFILES = {
    "brief": {
        "limit": 10,
        "header": "EveOS lean scoped state brief follows as JSON. Use it as a fast map, not a full dump.",
    },
    "summary": {
        "limit": 30,
        "header": "EveOS rich scoped state summary follows as JSON. Use it as reference context and prioritize explicit values.",
    },
    "deep": {
        "limit": 60,
        "header": "EveOS deep scoped state snapshot follows as JSON. Use it for fuller card/folder/tree reasoning without raw internal dumps.",
    },
    "full": {
        "limit": 90,
        "header": "EveOS complete scoped context snapshot follows as JSON. It is chunked for Gemini Live and still excludes raw internal dumps.",
    },
}


def _normalize_context_mode(mode):
    value = str(mode or "summary").strip().lower()
    if value in {"json", "complete"}:
        return "full"
    return value if value in CONTEXT_MODE_PROFILES else "summary"


def build_gemini_context_from_state(state, mode="summary", sample_limit=25, scope="workspace", workspace_id="", category_name="", workspace_ids=None):
    mode_value = _normalize_context_mode(mode)
    profile = CONTEXT_MODE_PROFILES.get(mode_value, CONTEXT_MODE_PROFILES["summary"])
    requested_limit = _to_number(sample_limit, profile["limit"])
    limit_value = max(5, min(200, requested_limit or profile["limit"]))
    scoped_state = _filter_state_for_gemini_scope(
        state,
        scope=scope,
        workspace_id=workspace_id,
        category_name=category_name,
        workspace_ids=workspace_ids,
    )

    payload = build_gemini_summary(scoped_state, sample_limit=limit_value)
    if mode_value == "full":
        payload = {
            "kind": "eveos_scoped_context_snapshot",
            "generatedAt": payload.get("generatedAt"),
            "scope": payload.get("scope"),
            "counts": payload.get("counts"),
            "breakdown": payload.get("breakdown"),
            "structuredScope": payload.get("structuredScope"),
            "nexusLog": payload.get("nexusLog"),
        }
    # Empty strings/arrays/objects carry zero information — strip them everywhere so the model
    # only reads real values. Numbers and booleans (incl. 0/false) always ship.
    payload = _prune_empty_deep(payload)
    header = (
        f"[SYSTEM CONTEXT: {profile['header']} "
        "Each bookmark's `card` is its \"workspaceId::cardName\" container; bookmarkIdentifiers "
        "are the user-facing marker/category pills. Absent fields mean empty/none.]"
    )

    # ALL tiers ship compact JSON — pretty-print indentation is pure whitespace tokens that cost
    # Gemini context for zero info, even on the deep/full snapshots.
    payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return {
        "mode": mode_value,
        "payload": payload,
        "contextText": f"{header}\n{payload_json}",
    }
