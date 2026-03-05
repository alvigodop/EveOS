import json
import os
from pathlib import Path


DATA_ROOT = Path(os.getcwd()) / "data"
DEFAULT_STORE_ROOT = DATA_ROOT / "modular-state"


def resolve_raw_path(path_value):
    raw = str(path_value or "").strip().strip('"')
    if not raw:
        return DEFAULT_STORE_ROOT.resolve()
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = Path(os.getcwd()) / path
    return path.resolve()


def read_json_dict(path_obj):
    try:
        payload = json.loads(Path(path_obj).read_text(encoding="utf-8"))
    except Exception:
        payload = {}
    return payload if isinstance(payload, dict) else {}


def guess_workspace_id_from_folder_name(folder_name):
    raw = str(folder_name or "").strip()
    if not raw:
        return "main"
    pre_hash = raw.split("--", 1)[0]
    token = pre_hash.split("-", 1)[0].strip()
    return token or "main"


def infer_workspace_from_tab_folder(tab_folder):
    tab_data = read_json_dict(Path(tab_folder) / "tab.json")
    workspace_id = str(tab_data.get("id") or "").strip()
    return workspace_id or guess_workspace_id_from_folder_name(Path(tab_folder).name)


def infer_category_from_card_folder(card_folder):
    card_data = read_json_dict(Path(card_folder) / "card.json")
    for key in ("categoryName", "name", "title"):
        value = str(card_data.get(key) or "").strip()
        if value:
            return value
    return str(Path(card_folder).name or "Unsorted").strip() or "Unsorted"


def infer_workspace_from_card_folder(card_folder):
    card_data = read_json_dict(Path(card_folder) / "card.json")
    from_card = str(card_data.get("workspaceId") or "").strip()
    if from_card:
        return from_card

    card_path = Path(card_folder)
    if card_path.parent.name.lower() == "cards":
        tab_folder = card_path.parent.parent
        if looks_like_tab_folder(tab_folder):
            return infer_workspace_from_tab_folder(tab_folder)
    return "main"


def infer_workspace_from_cards_root(cards_root, config=None, store_meta=None):
    cfg = config if isinstance(config, dict) else {}
    meta = store_meta if isinstance(store_meta, dict) else {}

    configured_active = str(cfg.get("activeWorkspace") or "").strip()
    if configured_active:
        return configured_active

    meta_active = str(meta.get("activeWorkspace") or "").strip()
    if meta_active:
        return meta_active

    cards_path = Path(cards_root)
    try:
        for child in sorted(cards_path.iterdir()):
            if not child.is_dir():
                continue
            if not looks_like_card_folder(child):
                continue
            inferred = infer_workspace_from_card_folder(child)
            if inferred:
                return inferred
    except Exception:
        pass
    return "main"


def looks_like_store_root(path_obj):
    try:
        return (path_obj / "tabs").is_dir() or (path_obj / "_meta").is_dir() or (path_obj / "cards").is_dir()
    except Exception:
        return False


def looks_like_tabs_root(path_obj):
    try:
        return path_obj.is_dir() and path_obj.name.lower() == "tabs"
    except Exception:
        return False


def looks_like_tab_folder(path_obj):
    try:
        return path_obj.is_dir() and (path_obj / "tab.json").is_file() and (path_obj / "cards").is_dir()
    except Exception:
        return False


def looks_like_card_folder(path_obj):
    try:
        if not path_obj.is_dir():
            return False
        return (path_obj / "card.json").is_file() or (path_obj / "entries").is_dir()
    except Exception:
        return False


def coerce_store_root(path_obj, depth=0):
    candidate = Path(path_obj).resolve()
    if depth > 6:
        return candidate

    if looks_like_store_root(candidate):
        return candidate

    if looks_like_tabs_root(candidate):
        return candidate.parent.resolve()

    if candidate.name.lower() == "cards":
        tab_folder = candidate.parent
        if looks_like_tab_folder(tab_folder):
            if tab_folder.parent.name.lower() == "tabs":
                return tab_folder.parent.parent.resolve()
            return tab_folder.parent.resolve()
        if candidate.is_dir():
            try:
                if any(child.is_dir() for child in candidate.iterdir()):
                    return candidate.parent.resolve()
            except Exception:
                pass

    if candidate.name.lower() == "entries":
        return coerce_store_root(candidate.parent, depth + 1)

    if looks_like_tab_folder(candidate):
        if candidate.parent.name.lower() == "tabs":
            return candidate.parent.parent.resolve()
        return candidate.parent.resolve()

    if looks_like_card_folder(candidate):
        if candidate.parent.name.lower() == "cards":
            tab_folder = candidate.parent.parent
            if looks_like_tab_folder(tab_folder):
                if tab_folder.parent.name.lower() == "tabs":
                    return tab_folder.parent.parent.resolve()
                return tab_folder.parent.resolve()
            return candidate.parent.parent.resolve()

    try:
        child_dirs = [child for child in candidate.iterdir() if child.is_dir()]
    except Exception:
        child_dirs = []

    if len(child_dirs) == 1:
        only_child = child_dirs[0]
        if (
            looks_like_store_root(only_child)
            or looks_like_tabs_root(only_child)
            or looks_like_tab_folder(only_child)
            or looks_like_card_folder(only_child)
            or only_child.name.lower() == "cards"
            or only_child.name.lower() == "entries"
        ):
            return coerce_store_root(only_child, depth + 1)

    return candidate


def resolve_store_path(path_value):
    return coerce_store_root(resolve_raw_path(path_value))


def resolve_store_target(path_value):
    requested = resolve_raw_path(path_value)
    resolved_root = coerce_store_root(requested)
    requested_lower = requested.name.lower()

    selection = {
        "layer": "store",
        "workspaceId": "",
        "categoryName": "",
        "bookmarkId": "",
        "requestedPath": str(requested)
    }

    if looks_like_tabs_root(requested):
        return requested, resolved_root, selection

    if looks_like_tab_folder(requested):
        selection["layer"] = "tab"
        selection["workspaceId"] = infer_workspace_from_tab_folder(requested)
        return requested, resolved_root, selection

    if requested_lower == "cards" and looks_like_tab_folder(requested.parent):
        selection["layer"] = "tab"
        selection["workspaceId"] = infer_workspace_from_tab_folder(requested.parent)
        return requested, resolved_root, selection

    if requested_lower == "cards" and requested.is_dir():
        selection["layer"] = "tab"
        selection["workspaceId"] = infer_workspace_from_cards_root(requested)
        return requested, resolved_root, selection

    if requested_lower == "entries" and requested.parent.exists():
        requested = requested.parent
        requested_lower = requested.name.lower()

    if looks_like_card_folder(requested):
        selection["layer"] = "card"
        selection["workspaceId"] = infer_workspace_from_card_folder(requested)
        selection["categoryName"] = infer_category_from_card_folder(requested)
        selection["requestedPath"] = str(requested)
        return requested, resolved_root, selection

    return requested, resolved_root, selection
