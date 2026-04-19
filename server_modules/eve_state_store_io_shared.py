from server_modules.eve_state_store_files_folders import (
    normalize_bookmark_folder_node,
    normalize_bookmark_folder_tree,
    normalize_bookmark_folder_tree_settings,
)
from server_modules.eve_state_store_files_shared import scoped_key


def normalize_workspace_meta_record(raw_workspace, *, fallback_id="main", fallback_name=None, fallback_icon="folder"):
    workspace_meta = dict(raw_workspace or {}) if isinstance(raw_workspace, dict) else {}

    workspace_id = str(workspace_meta.get("id") or fallback_id or "").strip() or "main"
    workspace_meta["id"] = workspace_id
    workspace_meta["name"] = workspace_meta.get("name") or fallback_name or workspace_id
    workspace_meta["icon"] = workspace_meta.get("icon") or fallback_icon or "folder"

    if not isinstance(workspace_meta.get("subTabs"), list):
        workspace_meta["subTabs"] = []

    workspace_meta.pop("schema", None)
    workspace_meta.pop("bookmarkCount", None)
    workspace_meta.pop("cardCount", None)
    return workspace_meta


def normalize_bookmark_folders_map(raw_folders):
    normalized = {}
    for key, tree in (raw_folders or {}).items():
        parsed = key if isinstance(key, dict) else None
        if parsed is None:
            scoped = str(key or "").strip()
            if not scoped:
                continue
            if "::" in scoped:
                workspace_id, category_name = scoped.split("::", 1)
            else:
                workspace_id, category_name = "main", scoped
        else:
            workspace_id = str(parsed.get("workspace_id") or "main").strip() or "main"
            category_name = str(parsed.get("category_name") or "Unsorted").strip() or "Unsorted"
        scoped = scoped_key(workspace_id, category_name)
        normalized_tree = normalize_bookmark_folder_tree(tree)
        nodes = list(normalized_tree.get("nodes") or [])
        settings = normalize_bookmark_folder_tree_settings(normalized_tree.get("settings"))
        if nodes or settings.get("clickBehaviorMode") != "inherit":
            normalized[scoped] = {
                "nodes": nodes,
                "settings": settings,
            }
    return normalized
