from server_modules.eve_state_store_files_shared import (
    folder_name,
    parse_scoped_category_key,
    scoped_key,
)


def normalize_library_folder_view(folder_view):
    source = folder_view if isinstance(folder_view, dict) else {}
    chain = []
    for step in source.get("chain") or []:
        if not isinstance(step, dict):
            continue
        selection = str(step.get("selection") or "").strip()
        if not selection:
            continue
        chain.append({"selection": selection})
    return {
        "root": str(source.get("root") or "all").strip() or "all",
        "chain": chain,
        "expanded": bool(source.get("expanded")),
    }


def build_library_index(categories):
    by_scope = {}
    for key, data in (categories or {}).items():
        parsed = parse_scoped_category_key(key)
        scoped = scoped_key(parsed["workspace_id"] or "main", parsed["category_name"])
        entries = (data or {}).get("entries") or []
        entry_map = {}
        for entry in entries:
            entry_id = str((entry or {}).get("id") or "").strip()
            if entry_id:
                entry_map[entry_id] = entry
        by_scope[scoped] = {
            "data_type": (data or {}).get("dataType") or "graphicNovels",
            "entries": entry_map,
            "folder_view": normalize_library_folder_view((data or {}).get("folderView") or {}),
        }
    return by_scope


def build_workspaces(config):
    workspaces = list((config or {}).get("workspaces") or [])
    if not workspaces:
        workspaces = [{"id": "main", "name": "Main", "icon": "\U0001F3E0", "subTabs": []}]

    def normalize_workspace_node(node, seen_ids):
        if isinstance(node, str):
            node = {"id": node, "name": node, "icon": "\U0001F4C1", "subTabs": []}
        if not isinstance(node, dict):
            return None

        ws_id = str(node.get("id") or "").strip() or "main"
        if ws_id in seen_ids:
            return None
        seen_ids.add(ws_id)

        normalized_node = dict(node)
        normalized_node["id"] = ws_id
        normalized_node["name"] = node.get("name") or ws_id
        normalized_node["icon"] = node.get("icon") or "\U0001F4C1"
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
        normalized = [{"id": "main", "name": "Main", "icon": "\U0001F3E0", "subTabs": []}]
    return normalized


def iter_workspace_nodes(workspaces):
    for workspace in workspaces or []:
        if not isinstance(workspace, dict):
            continue
        yield workspace
        yield from iter_workspace_nodes(workspace.get("subTabs") or [])


def find_workspace_node(workspaces, workspace_id):
    target_id = str(workspace_id or "").strip()
    if not target_id:
        return None
    for workspace in iter_workspace_nodes(workspaces):
        if str((workspace or {}).get("id") or "").strip() == target_id:
            return workspace
    return None


def iter_workspace_folder_paths(workspaces, parent_parts=()):
    for workspace in workspaces or []:
        if not isinstance(workspace, dict):
            continue
        workspace_id = str((workspace or {}).get("id") or "").strip() or "main"
        workspace_name = str((workspace or {}).get("name") or workspace_id).strip() or workspace_id
        folder = folder_name(f"{workspace_id}-{workspace_name}", workspace_id)
        current_parts = tuple(parent_parts) + (folder,)
        yield workspace, current_parts
        child_parts = current_parts + ("tabs",)
        yield from iter_workspace_folder_paths(workspace.get("subTabs") or [], child_parts)


def build_workspace_folder_parts(workspaces, workspace_id):
    target_id = str(workspace_id or "").strip()
    if not target_id:
        return ()
    for workspace, parts in iter_workspace_folder_paths(workspaces):
        if str((workspace or {}).get("id") or "").strip() == target_id:
            return tuple(parts)
    return ()


def prepare_workspace_map(links, workspaces, categories=None, folder_trees=None):
    by_workspace = {}
    for ws in iter_workspace_nodes(workspaces):
        by_workspace[ws["id"]] = {
            "meta": ws,
            "links": [],
            "categories": {},
        }

    for link in links:
        item = dict(link or {})
        workspace_id = str(item.get("workspace") or "").strip() or "main"
        category_name = str(item.get("category") or "").strip() or "Unsorted"
        item["workspace"] = workspace_id
        item["category"] = category_name
        if workspace_id not in by_workspace:
            by_workspace[workspace_id] = {
                "meta": {"id": workspace_id, "name": workspace_id, "icon": "\U0001F4C1"},
                "links": [],
                "categories": {},
            }
        by_workspace[workspace_id]["links"].append(item)
        by_workspace[workspace_id]["categories"].setdefault(category_name, []).append(item)

    for scoped_key_value in list((categories or {}).keys()) + list((folder_trees or {}).keys()):
        parsed = parse_scoped_category_key(scoped_key_value)
        workspace_id = str(parsed.get("workspace_id") or "").strip() or "main"
        category_name = str(parsed.get("category_name") or "").strip() or "Unsorted"
        if workspace_id not in by_workspace:
            by_workspace[workspace_id] = {
                "meta": {"id": workspace_id, "name": workspace_id, "icon": "\U0001F4C1"},
                "links": [],
                "categories": {},
            }
        by_workspace[workspace_id]["categories"].setdefault(category_name, [])

    return by_workspace
