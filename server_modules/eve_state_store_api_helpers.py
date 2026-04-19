import json
from http import HTTPStatus
from pathlib import Path

from server_modules.eve_state_store_files_folders import (
    build_bookmark_folder_dirname,
    normalize_bookmark_folder_tree,
)
from server_modules.eve_state_store_files_shared import (
    build_bookmark_filename,
    folder_name,
    scoped_key,
)
from server_modules.eve_state_store_files_workspaces import (
    build_workspace_folder_parts,
    find_workspace_node,
)


def send_json(handler, status_code, payload):
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))


def read_request_json(handler):
    try:
        content_length = int(handler.headers.get("Content-Length", "0"))
    except ValueError:
        content_length = 0
    if content_length <= 0:
        return None, "Empty request body"
    raw = handler.rfile.read(content_length)
    try:
        return json.loads(raw.decode("utf-8")), None
    except Exception as exc:
        return None, f"Invalid JSON body: {exc}"


def query_value(query, key, default=""):
    values = query.get(key) or []
    if not values:
        return default
    return str(values[0] or default).strip()


def normalize_layer_scope(value):
    scope = str(value or "store").strip().lower()
    return scope if scope in {"store", "tab", "card", "folder", "bookmark"} else "store"


def build_folder_chain_parts(folder_tree, folder_id):
    target_folder_id = str(folder_id or "").strip()
    if not target_folder_id:
        return []

    nodes = list((normalize_bookmark_folder_tree(folder_tree) or {}).get("nodes") or [])
    node_by_id = {
        str((node or {}).get("id") or "").strip(): dict(node or {})
        for node in nodes
        if str((node or {}).get("id") or "").strip()
    }
    if target_folder_id not in node_by_id:
        return []

    chain = []
    current_id = target_folder_id
    guard = 0
    while current_id and guard < 64:
        node = node_by_id.get(current_id)
        if not node:
            break
        chain.append(node)
        parent_id = str(node.get("parentId") or "").strip()
        if not parent_id or parent_id == current_id:
            break
        current_id = parent_id
        guard += 1

    chain.reverse()
    parts = []
    for node in chain:
        parts.extend(["folders", build_bookmark_folder_dirname(node)])
    return parts


def build_layer_preview_path(active_root, unified_state, *, layer, workspace_id, category_name, folder_id, bookmark_id):
    current_path = Path(active_root).resolve()
    scope = normalize_layer_scope(layer)
    if scope == "store":
        return str(current_path)

    state = unified_state if isinstance(unified_state, dict) else {}
    bookmarks = state.get("bookmarks") or {}
    config = bookmarks.get("config") or {}
    links = list(bookmarks.get("links") or [])
    folder_trees = bookmarks.get("folders") or {}

    resolved_workspace_id = str(workspace_id or config.get("activeWorkspace") or "main").strip() or "main"
    workspace_name = resolved_workspace_id
    workspace_meta = find_workspace_node(list(config.get("workspaces") or []), resolved_workspace_id)
    if workspace_meta:
        workspace_name = str((workspace_meta or {}).get("name") or resolved_workspace_id).strip() or resolved_workspace_id

    workspace_parts = build_workspace_folder_parts(
        list(config.get("workspaces") or []),
        resolved_workspace_id,
    )
    if workspace_parts:
        current_path = current_path / "tabs" / Path(*workspace_parts)
    else:
        current_path = current_path / "tabs" / folder_name(
            f"{resolved_workspace_id}-{workspace_name}",
            resolved_workspace_id,
        )
    if scope == "tab":
        return str(current_path)

    resolved_category_name = str(category_name or "Unsorted").strip() or "Unsorted"
    current_path = current_path / "cards" / folder_name(resolved_category_name, "card")
    if scope == "card":
        return str(current_path)

    effective_folder_id = str(folder_id or "").strip()
    target_link = None
    if scope == "bookmark":
        target_bookmark_id = str(bookmark_id or "").strip()
        if target_bookmark_id:
            target_link = next(
                (
                    dict(link or {})
                    for link in links
                    if str((link or {}).get("id") or "").strip() == target_bookmark_id
                    and str((link or {}).get("workspace") or "main").strip() == resolved_workspace_id
                    and str((link or {}).get("category") or "Unsorted").strip() == resolved_category_name
                ),
                None,
            )
        if target_link and not effective_folder_id:
            effective_folder_id = str(target_link.get("folderId") or "").strip()

    scoped_folder_tree = folder_trees.get(scoped_key(resolved_workspace_id, resolved_category_name)) or {}
    folder_chain_parts = build_folder_chain_parts(scoped_folder_tree, effective_folder_id)
    if folder_chain_parts:
        current_path = current_path.joinpath(*folder_chain_parts)

    if scope == "folder":
        return str(current_path)

    if scope == "bookmark":
        if not target_link:
            return str(current_path)
        bookmark_file = build_bookmark_filename(target_link, category_name=resolved_category_name)
        return str(current_path / "entries" / bookmark_file)

    return str(current_path)
