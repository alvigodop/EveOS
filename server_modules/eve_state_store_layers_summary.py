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
