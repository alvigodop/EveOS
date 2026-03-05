import hashlib
import json
import logging
import os
import re
import shutil
import threading
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime
from http import HTTPStatus
from pathlib import Path

logger = logging.getLogger("FandomDiscoveryServer")

DATA_ROOT = Path(os.getcwd()) / "data"
DEFAULT_STORE_ROOT = DATA_ROOT / "modular-state"
STORE_SETTINGS_FILE = DATA_ROOT / "modular-store-settings.json"

STORE_ROOT = DEFAULT_STORE_ROOT
META_DIR = STORE_ROOT / "_meta"
TABS_DIR = STORE_ROOT / "tabs"
FORMAT_VERSION = 1
STORE_SETTINGS_VERSION = 1
_STATE_LOCK = threading.RLock()
ACTIVE_STORE_SELECTION = {
    "layer": "store",
    "workspaceId": "",
    "categoryName": "",
    "bookmarkId": "",
    "requestedPath": str(DEFAULT_STORE_ROOT.resolve())
}


def _resolve_raw_path(path_value):
    raw = str(path_value or "").strip().strip('"')
    if not raw:
        return DEFAULT_STORE_ROOT.resolve()
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = (Path(os.getcwd()) / path)
    return path.resolve()


def _read_json_dict(path_obj):
    try:
        payload = json.loads(Path(path_obj).read_text(encoding="utf-8"))
    except Exception:
        payload = {}
    return payload if isinstance(payload, dict) else {}


def _guess_workspace_id_from_folder_name(folder_name):
    raw = str(folder_name or "").strip()
    if not raw:
        return "main"
    pre_hash = raw.split("--", 1)[0]
    token = pre_hash.split("-", 1)[0].strip()
    return token or "main"


def _infer_workspace_from_tab_folder(tab_folder):
    tab_data = _read_json_dict(Path(tab_folder) / "tab.json")
    workspace_id = str(tab_data.get("id") or "").strip()
    return workspace_id or _guess_workspace_id_from_folder_name(Path(tab_folder).name)


def _infer_category_from_card_folder(card_folder):
    card_data = _read_json_dict(Path(card_folder) / "card.json")
    for key in ("categoryName", "name", "title"):
        value = str(card_data.get(key) or "").strip()
        if value:
            return value
    return str(Path(card_folder).name or "Unsorted").strip() or "Unsorted"


def _infer_workspace_from_card_folder(card_folder):
    card_data = _read_json_dict(Path(card_folder) / "card.json")
    from_card = str(card_data.get("workspaceId") or "").strip()
    if from_card:
        return from_card

    card_path = Path(card_folder)
    if card_path.parent.name.lower() == "cards":
        tab_folder = card_path.parent.parent
        if _looks_like_tab_folder(tab_folder):
            return _infer_workspace_from_tab_folder(tab_folder)
    return "main"


def _infer_workspace_from_cards_root(cards_root, config=None, store_meta=None):
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
            if not _looks_like_card_folder(child):
                continue
            inferred = _infer_workspace_from_card_folder(child)
            if inferred:
                return inferred
    except Exception:
        pass
    return "main"


def _looks_like_store_root(path_obj):
    try:
        return (path_obj / "tabs").is_dir() or (path_obj / "_meta").is_dir() or (path_obj / "cards").is_dir()
    except Exception:
        return False


def _looks_like_tabs_root(path_obj):
    try:
        return path_obj.is_dir() and path_obj.name.lower() == "tabs"
    except Exception:
        return False


def _looks_like_tab_folder(path_obj):
    try:
        return path_obj.is_dir() and (path_obj / "tab.json").is_file() and (path_obj / "cards").is_dir()
    except Exception:
        return False


def _looks_like_card_folder(path_obj):
    try:
        if not path_obj.is_dir():
            return False
        return (path_obj / "card.json").is_file() or (path_obj / "entries").is_dir()
    except Exception:
        return False


def _coerce_store_root(path_obj, depth=0):
    candidate = Path(path_obj).resolve()
    if depth > 6:
        return candidate

    if _looks_like_store_root(candidate):
        return candidate

    if _looks_like_tabs_root(candidate):
        return candidate.parent.resolve()

    if candidate.name.lower() == "cards":
        tab_folder = candidate.parent
        if _looks_like_tab_folder(tab_folder):
            if tab_folder.parent.name.lower() == "tabs":
                return tab_folder.parent.parent.resolve()
            return tab_folder.parent.resolve()
        # cards/ directly under a backup root (card-layer export)
        if candidate.is_dir():
            try:
                if any(child.is_dir() for child in candidate.iterdir()):
                    return candidate.parent.resolve()
            except Exception:
                pass

    if candidate.name.lower() == "entries":
        return _coerce_store_root(candidate.parent, depth + 1)

    if _looks_like_tab_folder(candidate):
        if candidate.parent.name.lower() == "tabs":
            return candidate.parent.parent.resolve()
        return candidate.parent.resolve()

    if _looks_like_card_folder(candidate):
        if candidate.parent.name.lower() == "cards":
            tab_folder = candidate.parent.parent
            if _looks_like_tab_folder(tab_folder):
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
            _looks_like_store_root(only_child)
            or _looks_like_tabs_root(only_child)
            or _looks_like_tab_folder(only_child)
            or _looks_like_card_folder(only_child)
            or only_child.name.lower() == "cards"
            or only_child.name.lower() == "entries"
        ):
            return _coerce_store_root(only_child, depth + 1)

    return candidate


def _resolve_store_path(path_value):
    return _coerce_store_root(_resolve_raw_path(path_value))


def _pick_folder_path_native(initial_path=""):
    """Open a native folder picker and return an absolute path or empty string on cancel."""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as exc:
        raise RuntimeError(f"Native folder picker is unavailable: {exc}") from exc

    root = None
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        kwargs = {}
        initial = str(initial_path or "").strip()
        if initial:
            try:
                initial_dir = _resolve_raw_path(initial)
                if initial_dir.exists() and initial_dir.is_dir():
                    kwargs["initialdir"] = str(initial_dir)
            except Exception:
                pass
        selected = filedialog.askdirectory(**kwargs)
        if not selected:
            return ""
        return str(_resolve_raw_path(selected))
    except Exception as exc:
        raise RuntimeError(f"Failed to open native folder picker: {exc}") from exc
    finally:
        if root is not None:
            try:
                root.destroy()
            except Exception:
                pass


def _resolve_store_target(path_value):
    requested = _resolve_raw_path(path_value)
    resolved_root = _coerce_store_root(requested)
    requested_lower = requested.name.lower()

    selection = {
        "layer": "store",
        "workspaceId": "",
        "categoryName": "",
        "bookmarkId": "",
        "requestedPath": str(requested)
    }

    # Selecting tabs root means loading all tabs from that data pack.
    if _looks_like_tabs_root(requested):
        return requested, resolved_root, selection

    # Selecting a single tab folder means scoped tab view.
    if _looks_like_tab_folder(requested):
        selection["layer"] = "tab"
        selection["workspaceId"] = _infer_workspace_from_tab_folder(requested)
        return requested, resolved_root, selection

    # Selecting cards folder inside a tab should scope to that tab.
    if requested_lower == "cards" and _looks_like_tab_folder(requested.parent):
        selection["layer"] = "tab"
        selection["workspaceId"] = _infer_workspace_from_tab_folder(requested.parent)
        return requested, resolved_root, selection

    # Selecting cards root from a card-layer backup should scope to that workspace.
    if requested_lower == "cards" and requested.is_dir():
        selection["layer"] = "tab"
        selection["workspaceId"] = _infer_workspace_from_cards_root(requested)
        return requested, resolved_root, selection

    # Selecting entries folder should scope to the parent card.
    if requested_lower == "entries" and requested.parent.exists():
        requested = requested.parent
        requested_lower = requested.name.lower()

    # Selecting a card folder means scoped card view.
    if _looks_like_card_folder(requested):
        selection["layer"] = "card"
        selection["workspaceId"] = _infer_workspace_from_card_folder(requested)
        selection["categoryName"] = _infer_category_from_card_folder(requested)
        selection["requestedPath"] = str(requested)
        return requested, resolved_root, selection

    return requested, resolved_root, selection


def _set_store_root_paths(path_value):
    global STORE_ROOT, META_DIR, TABS_DIR
    resolved = _resolve_store_path(path_value)
    STORE_ROOT = resolved
    META_DIR = STORE_ROOT / "_meta"
    TABS_DIR = STORE_ROOT / "tabs"
    return STORE_ROOT


def _save_store_settings(active_path, requested_path=None):
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "eveos.modular-store-settings.v1",
        "version": STORE_SETTINGS_VERSION,
        "activePath": str(active_path),
        "requestedPath": str(requested_path or active_path),
        "updatedAt": datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    }
    STORE_SETTINGS_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_store_settings_path():
    if not STORE_SETTINGS_FILE.exists():
        return DEFAULT_STORE_ROOT
    try:
        payload = json.loads(STORE_SETTINGS_FILE.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("Ignoring invalid modular store settings file: %s", STORE_SETTINGS_FILE)
        return DEFAULT_STORE_ROOT
    requested = payload.get("requestedPath")
    active = payload.get("activePath")
    chosen = requested or active
    if not chosen:
        return DEFAULT_STORE_ROOT
    return _resolve_raw_path(chosen)


def get_active_store_root():
    return STORE_ROOT


def get_active_store_selection():
    return dict(ACTIVE_STORE_SELECTION)


def set_active_store_root(path_value, create_if_missing=False, persist=True):
    global ACTIVE_STORE_SELECTION
    requested, resolved, selection = _resolve_store_target(path_value)
    if str(resolved) != str(requested):
        logger.info("Adjusted modular store root from '%s' to '%s'", requested, resolved)
    if selection.get("layer") != "store":
        logger.info(
            "Activated scoped modular selection: layer=%s workspace=%s category=%s source=%s",
            selection.get("layer"),
            selection.get("workspaceId") or "-",
            selection.get("categoryName") or "-",
            selection.get("requestedPath") or str(requested)
        )
    if resolved.exists() and not resolved.is_dir():
        raise ValueError(f"Path is not a directory: {resolved}")
    if not resolved.exists() and create_if_missing:
        resolved.mkdir(parents=True, exist_ok=True)
    _set_store_root_paths(resolved)
    ACTIVE_STORE_SELECTION = selection
    if persist:
        _save_store_settings(resolved, requested_path=selection.get("requestedPath") or str(requested))
    return resolved


@contextmanager
def _temporary_store_root(path_value):
    global STORE_ROOT, META_DIR, TABS_DIR
    prev_store_root = STORE_ROOT
    prev_meta_dir = META_DIR
    prev_tabs_dir = TABS_DIR
    _set_store_root_paths(path_value)
    try:
        yield
    finally:
        STORE_ROOT = prev_store_root
        META_DIR = prev_meta_dir
        TABS_DIR = prev_tabs_dir


try:
    set_active_store_root(_load_store_settings_path(), create_if_missing=False, persist=False)
except Exception as exc:
    logger.warning("Failed to load modular store path from settings: %s", exc)
    _set_store_root_paths(DEFAULT_STORE_ROOT)


def _send_json(handler, status_code, payload):
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))


def _read_request_json(handler):
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


def _slugify(value, fallback="item"):
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or fallback


def _folder_name(label, fallback):
    slug = _slugify(label, fallback)
    short_hash = hashlib.sha1(str(label or "").encode("utf-8")).hexdigest()[:6]
    return f"{slug}--{short_hash}"


def _parse_scoped_category_key(key):
    raw = str(key or "")
    if "::" not in raw:
        return {
            "workspace_id": "",
            "category_name": raw.strip() or "Unsorted"
        }
    workspace_id, category_name = raw.split("::", 1)
    return {
        "workspace_id": workspace_id.strip(),
        "category_name": category_name.strip() or "Unsorted"
    }


def _scoped_key(workspace_id, category_name):
    ws = str(workspace_id or "").strip() or "main"
    cat = str(category_name or "").strip() or "Unsorted"
    return f"{ws}::{cat}"


def _safe_filename(value, fallback):
    text = str(value or "").strip()
    text = re.sub(r'[<>:"/\\\\|?*\x00-\x1f]', "_", text)
    text = text.strip(" .")
    return text or fallback


def _clean_name_segment(value, fallback, max_length):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = _safe_filename(text, fallback)
    if len(text) > max_length:
        text = text[:max_length].rstrip(" .-_")
    return text or fallback


def _extract_bookmark_dict(payload):
    if not isinstance(payload, dict):
        return {}
    bookmark = payload.get("bookmark")
    if isinstance(bookmark, dict):
        return bookmark
    return payload


def _read_bookmark_id_from_file(path):
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return ""
    bookmark = _extract_bookmark_dict(payload)
    return str((bookmark or {}).get("id") or "").strip()


def _build_bookmark_filename(bookmark, category_name=""):
    item = bookmark or {}
    link_id_raw = str(item.get("id") or "").strip() or "bookmark"
    link_part = _clean_name_segment(link_id_raw, "bookmark", 40)
    card_part = _clean_name_segment(category_name, "uncategorized", 60)
    title_part = _clean_name_segment(item.get("title"), "untitled", 80)
    base_name = f"{link_part}--{card_part}--{title_part}.json"
    fallback = f"{link_part}.json"
    return _safe_filename(base_name, fallback)


def _normalize_bookmark_filename(path, bookmark, category_name=""):
    expected_name = _build_bookmark_filename(bookmark, category_name=category_name)
    if path.name == expected_name:
        return path

    target = path.with_name(expected_name)
    if target.exists() and target != path:
        source_link_id = str((bookmark or {}).get("id") or "").strip()
        target_link_id = _read_bookmark_id_from_file(target)
        if source_link_id and source_link_id == target_link_id:
            try:
                path.unlink()
                logger.info(
                    "Removed duplicate bookmark file after canonical match: %s (kept %s)",
                    path.name,
                    target.name
                )
                return target
            except Exception:
                logger.warning(
                    "Failed to remove duplicate bookmark file '%s' while keeping '%s'",
                    path,
                    target
                )
        # Avoid clobbering unrelated existing file.
        short_hash = hashlib.sha1(str(path).encode("utf-8")).hexdigest()[:6]
        stem = target.stem
        suffix = target.suffix
        target = path.with_name(_safe_filename(f"{stem}--{short_hash}{suffix}", path.name))

    try:
        path.rename(target)
        logger.info("Renamed bookmark file to canonical name: %s -> %s", path.name, target.name)
        return target
    except Exception:
        logger.warning("Failed to rename bookmark file '%s' to '%s'", path, target)
        return path


def _connection_category_name(conn):
    return (
        conn.get("categoryName")
        or conn.get("category")
        or conn.get("libraryCategory")
        or "Unsorted"
    )


def _connection_entry_id(conn):
    return conn.get("libraryEntryId") or conn.get("entryId")


def _build_library_index(categories):
    by_scope = {}
    for key, data in (categories or {}).items():
        parsed = _parse_scoped_category_key(key)
        scoped = _scoped_key(parsed["workspace_id"] or "main", parsed["category_name"])
        entries = (data or {}).get("entries") or []
        entry_map = {}
        for entry in entries:
            entry_id = str((entry or {}).get("id") or "").strip()
            if entry_id:
                entry_map[entry_id] = entry
        by_scope[scoped] = {
            "data_type": (data or {}).get("dataType") or "graphicNovels",
            "entries": entry_map
        }
    return by_scope


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


def _prepare_workspace_map(links, workspaces):
    by_workspace = {}
    for ws in workspaces:
        by_workspace[ws["id"]] = {
            "meta": ws,
            "links": [],
            "categories": {}
        }

    for link in links:
        item = dict(link or {})
        workspace_id = str(item.get("workspace") or "").strip() or "main"
        category_name = str(item.get("category") or "").strip() or "Unsorted"
        item["workspace"] = workspace_id
        item["category"] = category_name
        if workspace_id not in by_workspace:
            by_workspace[workspace_id] = {
                "meta": {"id": workspace_id, "name": workspace_id, "icon": "📁"},
                "links": [],
                "categories": {}
            }
        by_workspace[workspace_id]["links"].append(item)
        by_workspace[workspace_id]["categories"].setdefault(category_name, []).append(item)

    return by_workspace


def _load_json_file(path, fallback=None):
    default = fallback if fallback is not None else {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _paths_equal(left, right):
    try:
        left_resolved = str(Path(left).resolve()).lower()
        right_resolved = str(Path(right).resolve()).lower()
        return left_resolved == right_resolved
    except Exception:
        return str(left).lower() == str(right).lower()


def _resolve_card_category_name(card_data, fallback_name):
    if not isinstance(card_data, dict):
        card_data = {}
    # Prefer explicit structural keys over display/title text to reduce
    # canonical-name flip-flopping during reload/save cycles.
    for key in ("categoryName", "name", "title"):
        candidate = str(card_data.get(key) or "").strip()
        if candidate:
            return candidate
    fallback = str(fallback_name or "").strip()
    return fallback or "Unsorted"


def _resolve_bookmark_folder(card_folder, card_data):
    bookmark_folder_name = (card_data or {}).get("bookmarkFolder") or "entries"
    bookmark_folder = card_folder / bookmark_folder_name
    if bookmark_folder.exists():
        return bookmark_folder

    entries_folder = card_folder / "entries"
    legacy_named_folder = card_folder / card_folder.name
    if entries_folder.exists():
        return entries_folder
    if legacy_named_folder.exists():
        return legacy_named_folder
    return card_folder


def _upsert_card_metadata(card_folder, workspace_id, category_name):
    card_file = card_folder / "card.json"
    card_data = _load_json_file(card_file, fallback={})
    if not isinstance(card_data, dict):
        card_data = {}

    bookmark_folder = _resolve_bookmark_folder(card_folder, card_data)
    bookmark_folder_name = "entries" if _paths_equal(bookmark_folder, card_folder / "entries") else (card_data.get("bookmarkFolder") or "entries")
    try:
        bookmark_count = len([p for p in bookmark_folder.glob("*.json") if p.is_file() and not p.name.startswith("_")])
    except Exception:
        bookmark_count = int(card_data.get("bookmarkCount") or 0)

    updated = dict(card_data)
    updated["schema"] = "eveos.card.v1"
    updated["workspaceId"] = workspace_id
    updated["categoryName"] = category_name
    updated["title"] = category_name
    updated["bookmarkFolder"] = bookmark_folder_name
    updated["bookmarkCount"] = bookmark_count

    if updated != card_data:
        card_file.write_text(json.dumps(updated, ensure_ascii=False, indent=2), encoding="utf-8")


def _merge_unlinked_library_files(source_file, target_file, workspace_id, category_name):
    source_payload = _load_json_file(source_file, fallback={})
    target_payload = _load_json_file(target_file, fallback={})
    source_entries = list((source_payload or {}).get("entries") or [])
    target_entries = list((target_payload or {}).get("entries") or [])

    merged_entries = []
    seen_ids = set()
    for entry in target_entries + source_entries:
        entry_id = str((entry or {}).get("id") or "").strip()
        if entry_id and entry_id in seen_ids:
            continue
        if entry_id:
            seen_ids.add(entry_id)
        merged_entries.append(entry)

    merged_payload = {
        "schema": "eveos.card-library-unlinked.v1",
        "workspaceId": workspace_id,
        "categoryName": category_name,
        "entries": merged_entries
    }
    target_file.write_text(json.dumps(merged_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if source_file.exists() and not _paths_equal(source_file, target_file):
        source_file.unlink(missing_ok=True)


def _move_bookmark_file(source_file, target_folder):
    target_folder.mkdir(parents=True, exist_ok=True)
    target_file = target_folder / source_file.name
    if not target_file.exists():
        source_file.replace(target_file)
        return target_file

    source_link_id = _read_bookmark_id_from_file(source_file)
    target_link_id = _read_bookmark_id_from_file(target_file)
    if source_link_id and source_link_id == target_link_id:
        try:
            source_mtime = int(source_file.stat().st_mtime_ns)
        except Exception:
            source_mtime = 0
        try:
            target_mtime = int(target_file.stat().st_mtime_ns)
        except Exception:
            target_mtime = 0
        if source_mtime >= target_mtime:
            source_file.replace(target_file)
        else:
            source_file.unlink(missing_ok=True)
        return target_file

    short_hash = hashlib.sha1(str(source_file).encode("utf-8")).hexdigest()[:6]
    stem = source_file.stem
    suffix = source_file.suffix
    candidate = target_folder / _safe_filename(f"{stem}--{short_hash}{suffix}", source_file.name)
    if candidate.exists():
        short_hash = hashlib.sha1(f"{source_file}-{time.time_ns()}".encode("utf-8")).hexdigest()[:8]
        candidate = target_folder / _safe_filename(f"{stem}--{short_hash}{suffix}", source_file.name)
    source_file.replace(candidate)
    return candidate


def _merge_card_folders(source_folder, target_folder, workspace_id, category_name):
    source_card_data = _load_json_file(source_folder / "card.json", fallback={})
    target_card_data = _load_json_file(target_folder / "card.json", fallback={})
    source_bookmark_folder = _resolve_bookmark_folder(source_folder, source_card_data)
    target_bookmark_folder = _resolve_bookmark_folder(target_folder, target_card_data)

    if source_bookmark_folder.exists():
        for bookmark_file in sorted(source_bookmark_folder.glob("*.json")):
            if bookmark_file.name.startswith("_"):
                continue
            try:
                _move_bookmark_file(bookmark_file, target_bookmark_folder)
            except Exception:
                logger.warning("Failed to move bookmark file during card merge: %s", bookmark_file)

    source_unlinked = source_folder / "_library-unlinked.json"
    target_unlinked = target_folder / "_library-unlinked.json"
    if source_unlinked.exists():
        try:
            if target_unlinked.exists():
                _merge_unlinked_library_files(source_unlinked, target_unlinked, workspace_id, category_name)
            else:
                source_unlinked.replace(target_unlinked)
        except Exception:
            logger.warning("Failed to merge unlinked library files for card merge: %s -> %s", source_unlinked, target_unlinked)

    # Best-effort cleanup after moving card contents.
    try:
        if source_bookmark_folder.exists() and source_bookmark_folder.is_dir() and source_bookmark_folder != source_folder:
            source_bookmark_folder.rmdir()
    except Exception:
        pass

    try:
        (source_folder / "card.json").unlink(missing_ok=True)
    except Exception:
        pass

    try:
        source_folder.rmdir()
    except Exception:
        pass

    _upsert_card_metadata(target_folder, workspace_id, category_name)


def _normalize_workspace_card_layout(cards_root, workspace_id):
    if not cards_root.exists():
        return

    initial_folders = [p for p in sorted(cards_root.iterdir()) if p.is_dir()]
    for card_folder in initial_folders:
        if not card_folder.exists() or not card_folder.is_dir():
            continue

        card_data = _load_json_file(card_folder / "card.json", fallback={})
        category_name = _resolve_card_category_name(card_data, card_folder.name)
        canonical_folder = cards_root / _folder_name(category_name, "card")

        if _paths_equal(card_folder, canonical_folder):
            _upsert_card_metadata(card_folder, workspace_id, category_name)
            continue

        if not canonical_folder.exists():
            try:
                card_folder.rename(canonical_folder)
                logger.info("Renamed card folder to canonical name: %s -> %s", card_folder.name, canonical_folder.name)
                _upsert_card_metadata(canonical_folder, workspace_id, category_name)
            except Exception:
                logger.warning("Failed to rename card folder '%s' to '%s'", card_folder, canonical_folder)
            continue

        logger.info(
            "Merging card folder '%s' into existing '%s' for workspace '%s' category '%s'",
            card_folder.name,
            canonical_folder.name,
            workspace_id,
            category_name
        )
        _merge_card_folders(card_folder, canonical_folder, workspace_id, category_name)


def _ensure_clean_store():
    if STORE_ROOT.exists():
        shutil.rmtree(STORE_ROOT)
    META_DIR.mkdir(parents=True, exist_ok=True)
    TABS_DIR.mkdir(parents=True, exist_ok=True)


def _collect_status():
    if not STORE_ROOT.exists():
        return {
            "exists": False,
            "signature": "",
            "fileCount": 0,
            "lastModified": 0,
            "path": str(STORE_ROOT)
        }

    parts = []
    file_count = 0
    last_modified = 0

    for path in sorted(STORE_ROOT.rglob("*")):
        if not path.is_file():
            continue
        stat = path.stat()
        file_count += 1
        last_modified = max(last_modified, int(stat.st_mtime))
        rel = str(path.relative_to(STORE_ROOT)).replace("\\", "/")
        parts.append(f"{rel}:{stat.st_size}:{stat.st_mtime_ns}")

    signature = hashlib.sha1("\n".join(parts).encode("utf-8")).hexdigest() if parts else ""
    return {
        "exists": True,
        "signature": signature,
        "fileCount": file_count,
        "lastModified": last_modified,
        "path": str(STORE_ROOT)
    }


def _to_number(value, default):
    try:
        return int(value)
    except Exception:
        return default


def _build_gemini_summary(state, sample_limit=25):
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


def build_gemini_context(mode="summary", sample_limit=25):
    state = read_modular_state()
    mode_value = str(mode or "summary").strip().lower()
    limit_value = max(5, min(200, _to_number(sample_limit, 25)))

    if mode_value == "full":
        payload = state
        header = (
            "[SYSTEM CONTEXT: EveOS modular state snapshot follows as JSON. "
            "Use it as reference context. Do not fabricate fields that are absent.]"
        )
    else:
        payload = _build_gemini_summary(state, sample_limit=limit_value)
        header = (
            "[SYSTEM CONTEXT: EveOS modular state summary follows as JSON. "
            "Use it as reference context and prioritize explicit values.]"
        )

    payload_json = json.dumps(payload, ensure_ascii=False, indent=2)
    context_text = f"{header}\n{payload_json}"
    return {
        "mode": mode_value,
        "payload": payload,
        "contextText": context_text
    }


def _write_modular_state_full(state):
    if not isinstance(state, dict):
        raise ValueError("State payload must be a JSON object.")

    bookmarks = state.get("bookmarks") or {}
    library = state.get("library") or {}
    config = bookmarks.get("config") or {}
    links = list(bookmarks.get("links") or [])
    connections = list(library.get("connections") or [])
    categories = library.get("categories") or {}

    _ensure_clean_store()

    workspaces = _build_workspaces(config)
    workspace_map = _prepare_workspace_map(links, workspaces)
    library_index = _build_library_index(categories)

    # Connection index by link id.
    connections_by_link = {}
    connected_entry_ids = set()
    for conn in connections:
        link_id = str((conn or {}).get("linkId") or "").strip()
        if not link_id:
            continue
        connections_by_link[link_id] = dict(conn)
        entry_id = _connection_entry_id(conn or {})
        if entry_id:
            connected_entry_ids.add(str(entry_id))

    store_meta = {
        "format": "eveos.modular-state.v1",
        "version": FORMAT_VERSION,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "activeWorkspace": config.get("activeWorkspace") or "main",
        "workspaces": workspaces
    }

    (META_DIR / "store.json").write_text(
        json.dumps(store_meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (META_DIR / "config.json").write_text(
        json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    bookmark_count = 0
    tab_count = 0
    card_count = 0

    for workspace_id, ws_data in workspace_map.items():
        ws_meta = ws_data["meta"]
        workspace_folder = TABS_DIR / _folder_name(
            f"{workspace_id}-{ws_meta.get('name', workspace_id)}", workspace_id
        )
        cards_root = workspace_folder / "cards"
        cards_root.mkdir(parents=True, exist_ok=True)

        tab_payload = {
            "schema": "eveos.tab.v1",
            "id": workspace_id,
            "name": ws_meta.get("name") or workspace_id,
            "icon": ws_meta.get("icon") or "📁",
            "bookmarkCount": len(ws_data["links"]),
            "cardCount": len(ws_data["categories"])
        }
        (workspace_folder / "tab.json").write_text(
            json.dumps(tab_payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        tab_count += 1

        for category_name, category_links in ws_data["categories"].items():
            card_folder_name = _folder_name(category_name, "card")
            card_folder = cards_root / card_folder_name
            card_folder.mkdir(parents=True, exist_ok=True)

            # Keep bookmark records in a stable inner folder to avoid repeated
            # path segments like cards/start--xxxx/start--xxxx.
            bookmark_folder_name = "entries"
            bookmark_folder = card_folder / bookmark_folder_name
            bookmark_folder.mkdir(parents=True, exist_ok=True)

            scoped = _scoped_key(workspace_id, category_name)
            scoped_library = library_index.get(scoped, {})
            data_type = scoped_library.get("data_type") or "graphicNovels"

            card_payload = {
                "schema": "eveos.card.v1",
                "workspaceId": workspace_id,
                "categoryName": category_name,
                "title": category_name,
                "dataType": data_type,
                "bookmarkFolder": bookmark_folder_name,
                "bookmarkCount": len(category_links)
            }
            (card_folder / "card.json").write_text(
                json.dumps(card_payload, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            card_count += 1

            # Track linked entries for this card.
            used_entry_ids = set()

            for link in category_links:
                link_id = str(link.get("id") or "").strip()
                conn = connections_by_link.get(link_id)
                linked_entry = None
                linked = False

                if conn:
                    entry_id = str(_connection_entry_id(conn) or "").strip()
                    if entry_id:
                        used_entry_ids.add(entry_id)
                        linked_entry = (scoped_library.get("entries") or {}).get(entry_id)
                        if not linked_entry:
                            # Fallback search across all scoped categories.
                            for candidate in library_index.values():
                                entry_map = candidate.get("entries") or {}
                                if entry_id in entry_map:
                                    linked_entry = entry_map[entry_id]
                                    break
                        linked = linked_entry is not None

                bookmark_payload = {
                    "schema": "eveos.bookmark.v1",
                    "bookmark": link,
                    "library": {
                        "linked": linked,
                        "connection": conn or None,
                        "entry": linked_entry or None
                    }
                }
                bookmark_file = _build_bookmark_filename(link, category_name=category_name)
                (bookmark_folder / bookmark_file).write_text(
                    json.dumps(bookmark_payload, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                bookmark_count += 1

            # Keep category library entries that are not tied to bookmark connections.
            unlinked_entries = []
            for entry_id, entry in (scoped_library.get("entries") or {}).items():
                if entry_id in used_entry_ids or entry_id in connected_entry_ids:
                    continue
                unlinked_entries.append(entry)

            if unlinked_entries:
                unlinked_payload = {
                    "schema": "eveos.card-library-unlinked.v1",
                    "workspaceId": workspace_id,
                    "categoryName": category_name,
                    "entries": unlinked_entries
                }
                (card_folder / "_library-unlinked.json").write_text(
                    json.dumps(unlinked_payload, ensure_ascii=False, indent=2), encoding="utf-8"
                )

    status = _collect_status()
    return {
        "ok": True,
        "summary": {
            "tabs": tab_count,
            "cards": card_count,
            "bookmarks": bookmark_count
        },
        "status": status
    }


def write_modular_state(state):
    if not isinstance(state, dict):
        raise ValueError("State payload must be a JSON object.")

    selection = get_active_store_selection()
    layer = str(selection.get("layer") or "store").strip().lower()
    if layer not in {"tab", "card", "bookmark"}:
        return _write_modular_state_full(state)

    try:
        base_state = read_modular_state(apply_selection=False)
    except FileNotFoundError:
        base_state = _empty_unified_state()

    merged_state = _merge_layer_state(
        base_state,
        state,
        layer=layer,
        workspace_id=str(selection.get("workspaceId") or "").strip(),
        category_name=str(selection.get("categoryName") or "").strip(),
        bookmark_id=str(selection.get("bookmarkId") or "").strip()
    )
    return _write_modular_state_full(merged_state)


def _ingest_cards_root(cards_root, workspace_id, categories, entry_ids_by_scope, bookmark_records):
    if not cards_root.exists() or not cards_root.is_dir():
        return

    _normalize_workspace_card_layout(cards_root, workspace_id)

    for card_folder in sorted(cards_root.iterdir()):
        if not card_folder.is_dir():
            continue

        card_file = card_folder / "card.json"
        card_data = _load_json_file(card_file, fallback={})
        category_name = _resolve_card_category_name(card_data, card_folder.name)
        data_type = card_data.get("dataType") or "graphicNovels"
        bookmark_folder = _resolve_bookmark_folder(card_folder, card_data)

        scoped = _scoped_key(workspace_id, category_name)
        if scoped not in categories:
            categories[scoped] = {"entries": [], "dataType": data_type}
        else:
            categories[scoped]["dataType"] = categories[scoped].get("dataType") or data_type

        if scoped not in entry_ids_by_scope:
            entry_ids_by_scope[scoped] = {
                str((e or {}).get("id") or "").strip()
                for e in categories[scoped]["entries"]
                if str((e or {}).get("id") or "").strip()
            }
        entry_ids_for_scope = entry_ids_by_scope[scoped]

        for bookmark_file in sorted(bookmark_folder.glob("*.json")):
            if bookmark_file.name.startswith("_"):
                continue
            try:
                payload = json.loads(bookmark_file.read_text(encoding="utf-8"))
            except Exception:
                logger.warning("Skipping invalid bookmark file: %s", bookmark_file)
                continue

            bookmark = payload.get("bookmark") if isinstance(payload, dict) else None
            if not isinstance(bookmark, dict):
                # Backward compatibility: allow bookmark JSON directly.
                bookmark = payload if isinstance(payload, dict) else {}

            link_id = str(bookmark.get("id") or "").strip()
            if not link_id:
                continue

            bookmark_file = _normalize_bookmark_filename(bookmark_file, bookmark, category_name=category_name)

            try:
                mtime_ns = int(bookmark_file.stat().st_mtime_ns)
            except Exception:
                mtime_ns = 0

            bookmark_records.append({
                "link_id": link_id,
                "bookmark": bookmark,
                "library_payload": payload.get("library") if isinstance(payload, dict) else None,
                "workspace_id": workspace_id,
                "category_name": category_name,
                "scoped_key": scoped,
                "source_path": str(bookmark_file),
                "mtime_ns": mtime_ns
            })

        unlinked_file = card_folder / "_library-unlinked.json"
        if unlinked_file.exists():
            try:
                unlinked_payload = json.loads(unlinked_file.read_text(encoding="utf-8"))
                unlinked_entries = unlinked_payload.get("entries") or []
                for entry in unlinked_entries:
                    entry_id = str((entry or {}).get("id") or "").strip()
                    if not entry_id or entry_id in entry_ids_for_scope:
                        continue
                    categories[scoped]["entries"].append(entry)
                    entry_ids_for_scope.add(entry_id)
            except Exception:
                logger.warning("Skipping invalid unlinked library file: %s", unlinked_file)


def read_modular_state(apply_selection=True):
    if not STORE_ROOT.exists():
        raise FileNotFoundError(f"Modular state store not found at: {STORE_ROOT}")

    store_meta = {}
    config = {}
    store_file = META_DIR / "store.json"
    config_file = META_DIR / "config.json"

    if store_file.exists():
        store_meta = json.loads(store_file.read_text(encoding="utf-8"))
    if config_file.exists():
        config = json.loads(config_file.read_text(encoding="utf-8"))

    links = []
    connections_by_link = {}
    categories = {}
    workspaces = []
    seen_workspace_ids = set()
    bookmark_records = []
    entry_ids_by_scope = {}

    if TABS_DIR.exists():
        for ws_folder in sorted(TABS_DIR.iterdir()):
            if not ws_folder.is_dir():
                continue

            tab_file = ws_folder / "tab.json"
            tab_data = {}
            if tab_file.exists():
                try:
                    tab_data = json.loads(tab_file.read_text(encoding="utf-8"))
                except Exception:
                    tab_data = {}

            workspace_id = str(tab_data.get("id") or "").strip() or ws_folder.name
            workspace_name = tab_data.get("name") or workspace_id
            workspace_icon = tab_data.get("icon") or "📁"

            if workspace_id not in seen_workspace_ids:
                seen_workspace_ids.add(workspace_id)
                workspaces.append({
                    "id": workspace_id,
                    "name": workspace_name,
                    "icon": workspace_icon
                })

            cards_root = ws_folder / "cards"
            _ingest_cards_root(cards_root, workspace_id, categories, entry_ids_by_scope, bookmark_records)
    else:
        direct_cards_root = STORE_ROOT / "cards"
        if direct_cards_root.exists() and direct_cards_root.is_dir():
            workspace_id = _infer_workspace_from_cards_root(direct_cards_root, config=config, store_meta=store_meta)
            workspace_meta = next(
                (ws for ws in _build_workspaces(config) if str((ws or {}).get("id") or "").strip() == workspace_id),
                None
            )
            workspace_name = (workspace_meta or {}).get("name") or workspace_id
            workspace_icon = (workspace_meta or {}).get("icon") or "📁"

            if workspace_id not in seen_workspace_ids:
                seen_workspace_ids.add(workspace_id)
                workspaces.append({
                    "id": workspace_id,
                    "name": workspace_name,
                    "icon": workspace_icon
                })

            _ingest_cards_root(direct_cards_root, workspace_id, categories, entry_ids_by_scope, bookmark_records)

    # Resolve duplicate bookmark IDs by taking the most recently modified file.
    resolved_by_link = {}
    for record in bookmark_records:
        link_id = record["link_id"]
        existing = resolved_by_link.get(link_id)
        if existing is None:
            resolved_by_link[link_id] = record
            continue
        existing_mtime = int(existing.get("mtime_ns") or 0)
        next_mtime = int(record.get("mtime_ns") or 0)
        if (next_mtime, record.get("source_path", "")) >= (existing_mtime, existing.get("source_path", "")):
            logger.warning(
                "Duplicate bookmark id '%s' detected. Keeping newer file '%s' (replacing '%s').",
                link_id,
                record.get("source_path"),
                existing.get("source_path")
            )
            resolved_by_link[link_id] = record
        else:
            logger.warning(
                "Duplicate bookmark id '%s' detected. Keeping newer file '%s' and skipping '%s'.",
                link_id,
                existing.get("source_path"),
                record.get("source_path")
            )

    for record in sorted(
        resolved_by_link.values(),
        key=lambda item: (item.get("workspace_id", ""), item.get("category_name", ""), item.get("source_path", ""))
    ):
        workspace_id = record["workspace_id"]
        category_name = record["category_name"]
        scoped = record["scoped_key"]
        link_id = record["link_id"]

        bookmark = dict(record.get("bookmark") or {})
        bookmark["workspace"] = workspace_id
        bookmark["category"] = category_name
        links.append(bookmark)

        library_payload = record.get("library_payload")
        if not isinstance(library_payload, dict):
            continue

        connection = library_payload.get("connection")
        entry = library_payload.get("entry")
        linked = bool(library_payload.get("linked"))
        if not linked or not isinstance(entry, dict):
            continue

        normalized_connection = dict(connection) if isinstance(connection, dict) else {}
        normalized_connection["linkId"] = link_id
        normalized_connection["workspace"] = workspace_id
        normalized_connection["categoryName"] = category_name
        if not normalized_connection.get("id"):
            normalized_connection["id"] = f"conn-{link_id}"
        if not normalized_connection.get("libraryEntryId") and entry.get("id"):
            normalized_connection["libraryEntryId"] = entry.get("id")

        if normalized_connection.get("libraryEntryId"):
            connections_by_link[link_id] = normalized_connection

        entry_id = str(entry.get("id") or "").strip()
        if not entry_id:
            continue
        if scoped not in categories:
            categories[scoped] = {"entries": [], "dataType": "graphicNovels"}
        if scoped not in entry_ids_by_scope:
            entry_ids_by_scope[scoped] = set()
        if entry_id not in entry_ids_by_scope[scoped]:
            categories[scoped]["entries"].append(entry)
            entry_ids_by_scope[scoped].add(entry_id)

    if not workspaces:
        workspaces = [{"id": "main", "name": "Main", "icon": "🏠"}]

    merged_config = dict(config or {})
    merged_config["workspaces"] = workspaces
    merged_config["activeWorkspace"] = (
        merged_config.get("activeWorkspace")
        or store_meta.get("activeWorkspace")
        or workspaces[0]["id"]
    )

    unified = {
        "metadata": {
            "version": FORMAT_VERSION,
            "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "generator": "EveOS Modular State Loader",
            "source": "modular-state"
        },
        "bookmarks": {
            "links": links,
            "config": merged_config
        },
        "library": {
            "categories": categories,
            "connections": list(connections_by_link.values())
        }
    }

    if not apply_selection:
        return unified

    selection = get_active_store_selection()
    layer = str(selection.get("layer") or "store").strip().lower()
    if layer not in {"tab", "card", "bookmark"}:
        return unified

    try:
        return _extract_layer_state(
            unified,
            layer=layer,
            workspace_id=str(selection.get("workspaceId") or "").strip(),
            category_name=str(selection.get("categoryName") or "").strip(),
            bookmark_id=str(selection.get("bookmarkId") or "").strip()
        )
    except Exception as exc:
        logger.warning("Failed to apply modular selection filter (layer=%s): %s", layer, exc)
        return unified


def normalize_modular_bookmark_filenames():
    if not STORE_ROOT.exists():
        raise FileNotFoundError(f"Modular state store not found at: {STORE_ROOT}")
    # read_modular_state() performs canonical bookmark filename normalization.
    read_modular_state(apply_selection=False)
    return _collect_status()


VALID_LAYER_SCOPES = {"store", "tab", "card", "bookmark"}


def _empty_unified_state():
    return {
        "metadata": {
            "version": FORMAT_VERSION,
            "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "generator": "EveOS Modular State Loader"
        },
        "bookmarks": {
            "links": [],
            "config": {
                "workspaces": [{"id": "main", "name": "Main", "icon": "🏠"}],
                "activeWorkspace": "main"
            }
        },
        "library": {
            "categories": {},
            "connections": []
        }
    }


def _read_state_from_root(root_path):
    with _temporary_store_root(root_path):
        return read_modular_state(apply_selection=False)


def _write_state_to_root(state, root_path):
    with _temporary_store_root(root_path):
        # Backups must write the provided snapshot as-is into the destination
        # root, independent of the currently active scoped selection.
        return _write_modular_state_full(state)


def _write_card_layer_backup_to_root(state, root_path):
    """
    Write a card-layer backup with structure starting at:
      <root>/cards/<card>/...
    (without tab-level wrappers).
    """
    target_root = Path(root_path).resolve()
    temp_root = Path(tempfile.mkdtemp(prefix="eveos-card-layer-"))
    try:
        with _temporary_store_root(temp_root):
            _write_modular_state_full(state)

        copied_scopes = 0
        copied_cards = 0
        tabs_root = temp_root / "tabs"
        dst_cards_root = target_root / "cards"
        dst_cards_root.mkdir(parents=True, exist_ok=True)
        if tabs_root.exists():
            for workspace_folder in sorted(tabs_root.iterdir()):
                if not workspace_folder.is_dir():
                    continue
                src_cards_root = workspace_folder / "cards"
                if not src_cards_root.exists() or not src_cards_root.is_dir():
                    continue
                copied_scopes += 1
                for card_dir in sorted(src_cards_root.iterdir()):
                    if not card_dir.is_dir():
                        continue
                    target_card_dir = dst_cards_root / card_dir.name
                    if target_card_dir.exists():
                        scoped_name = _safe_filename(f"{workspace_folder.name}--{card_dir.name}", card_dir.name)
                        target_card_dir = dst_cards_root / scoped_name
                    shutil.copytree(card_dir, target_card_dir, dirs_exist_ok=True)
                    copied_cards += 1

        bookmark_count = len(list((state.get("bookmarks") or {}).get("links") or []))
        return {
            "ok": True,
            "summary": {
                "tabs": copied_scopes,
                "cards": copied_cards,
                "bookmarks": bookmark_count
            },
            "status": {}
        }
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


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
                "entries": []
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

    return {
        "metadata": dict(source.get("metadata") or {}),
        "bookmarks": {
            "links": links,
            "config": config
        },
        "library": {
            "categories": categories,
            "connections": connections
        }
    }


def _categories_scope_workspace(scoped_key):
    parsed = _parse_scoped_category_key(scoped_key)
    return str(parsed.get("workspace_id") or "main").strip() or "main"


def _categories_scope_category(scoped_key):
    parsed = _parse_scoped_category_key(scoped_key)
    return str(parsed.get("category_name") or "Unsorted").strip() or "Unsorted"


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


def _build_layer_state(links, config, categories, connections, layer_type, workspace_id="", category_name="", bookmark_id=""):
    safe_config = dict(config or {})
    safe_workspaces = _build_workspaces(safe_config)
    safe_config["workspaces"] = safe_workspaces
    if workspace_id:
        safe_config["activeWorkspace"] = workspace_id
    elif safe_workspaces:
        safe_config["activeWorkspace"] = str(safe_config.get("activeWorkspace") or safe_workspaces[0]["id"]).strip() or safe_workspaces[0]["id"]

    metadata = {
        "version": FORMAT_VERSION,
        "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "generator": "EveOS Modular Layer",
        "type": layer_type
    }
    if workspace_id:
        metadata["workspaceId"] = workspace_id
    if category_name:
        metadata["categoryName"] = category_name
    if bookmark_id:
        metadata["bookmarkId"] = bookmark_id

    return {
        "metadata": metadata,
        "bookmarks": {
            "links": _dedupe_links(links),
            "config": safe_config
        },
        "library": {
            "categories": {k: v for k, v in (categories or {}).items()},
            "connections": _normalize_connections(connections or [])
        }
    }


def _extract_layer_state(state, layer, workspace_id="", category_name="", bookmark_id=""):
    normalized = _normalize_state_payload(state)
    links = list(normalized["bookmarks"]["links"])
    config = dict(normalized["bookmarks"]["config"])
    categories = dict(normalized["library"]["categories"])
    connections = list(normalized["library"]["connections"])

    scope = str(layer or "store").strip().lower()
    if scope not in VALID_LAYER_SCOPES:
        raise ValueError(f"Unsupported layer scope: {scope}")
    if scope == "store":
        return _build_layer_state(links, config, categories, connections, "store")

    ws_id = str(workspace_id or "").strip() or str(config.get("activeWorkspace") or "").strip()
    if scope in {"tab", "card", "bookmark"} and not ws_id:
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
        tab_config = dict(config)
        _ensure_workspace_config_entry(tab_config, ws_id, incoming_config=config)
        tab_config["workspaces"] = [ws for ws in _build_workspaces(tab_config) if str(ws.get("id")) == ws_id] or [{"id": ws_id, "name": ws_id, "icon": "📁"}]
        return _build_layer_state(scoped_links, tab_config, scoped_categories, scoped_connections, "workspace", workspace_id=ws_id)

    cat_name = str(category_name or "").strip()
    if scope in {"card", "bookmark"} and not cat_name:
        raise ValueError("categoryName is required for card/bookmark layer scope.")

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
        card_config = dict(config)
        _ensure_workspace_config_entry(card_config, ws_id, incoming_config=config)
        card_config["workspaces"] = [ws for ws in _build_workspaces(card_config) if str(ws.get("id")) == ws_id] or [{"id": ws_id, "name": ws_id, "icon": "📁"}]
        return _build_layer_state(scoped_links, card_config, scoped_categories, scoped_connections, "card", workspace_id=ws_id, category_name=cat_name)

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
            "entries": [entry for entry in source_entries if str((entry or {}).get("id") or "").strip() in entry_ids]
        }

    bookmark_config = dict(config)
    _ensure_workspace_config_entry(bookmark_config, ws_from_link, incoming_config=config)
    bookmark_config["workspaces"] = [ws for ws in _build_workspaces(bookmark_config) if str(ws.get("id")) == ws_from_link] or [{"id": ws_from_link, "name": ws_from_link, "icon": "📁"}]
    return _build_layer_state([matched_link], bookmark_config, scoped_categories, scoped_connections, "bookmark", workspace_id=ws_from_link, category_name=cat_from_link, bookmark_id=target_bookmark_id)


def _merge_layer_state(base_state, incoming_state, layer, workspace_id="", category_name="", bookmark_id=""):
    base = _normalize_state_payload(base_state)
    incoming = _normalize_state_payload(incoming_state)
    scope = str(layer or "").strip().lower()
    if scope not in VALID_LAYER_SCOPES:
        raise ValueError(f"Unsupported layer scope: {scope}")

    if scope == "store":
        return _build_layer_state(
            incoming["bookmarks"]["links"],
            incoming["bookmarks"]["config"],
            incoming["library"]["categories"],
            incoming["library"]["connections"],
            "store"
        )

    base_links = list(base["bookmarks"]["links"])
    base_categories = dict(base["library"]["categories"])
    base_connections = list(base["library"]["connections"])
    base_config = dict(base["bookmarks"]["config"])
    incoming_links = list(incoming["bookmarks"]["links"])
    incoming_categories = dict(incoming["library"]["categories"])
    incoming_connections = list(incoming["library"]["connections"])
    incoming_config = dict(incoming["bookmarks"]["config"])

    ws_id = str(workspace_id or "").strip() or str(incoming_config.get("activeWorkspace") or "").strip()
    if scope in {"tab", "card", "bookmark"} and not ws_id:
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
        _ensure_workspace_config_entry(base_config, ws_id, incoming_config=incoming_config)
        base_config["activeWorkspace"] = ws_id
        return _build_layer_state(base_links, base_config, base_categories, base_connections, "workspace", workspace_id=ws_id)

    cat_name = str(category_name or "").strip()
    if scope in {"card", "bookmark"} and not cat_name:
        raise ValueError("categoryName is required for card/bookmark import.")

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
        _ensure_workspace_config_entry(base_config, ws_id, incoming_config=incoming_config)
        base_config["activeWorkspace"] = ws_id
        return _build_layer_state(base_links, base_config, base_categories, base_connections, "card", workspace_id=ws_id, category_name=cat_name)

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
        incoming_entries = [
            entry for entry in (incoming_categories.get(scoped_key) or {}).get("entries") or []
            if str((entry or {}).get("id") or "").strip() in entry_ids
        ]
        existing_data = base_categories.get(scoped_key) or {"dataType": "graphicNovels", "entries": []}
        base_categories[scoped_key] = {
            "dataType": existing_data.get("dataType") or (incoming_categories.get(scoped_key) or {}).get("dataType") or "graphicNovels",
            "entries": _merge_entries(existing_data.get("entries") or [], incoming_entries)
        }

    _ensure_workspace_config_entry(base_config, ws_from_link, incoming_config=incoming_config)
    base_config["activeWorkspace"] = ws_from_link
    return _build_layer_state(
        base_links,
        base_config,
        base_categories,
        base_connections,
        "bookmark",
        workspace_id=ws_from_link,
        category_name=cat_from_link,
        bookmark_id=target_bookmark_id
    )


def _default_backup_folder_name(layer):
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_layer = _slugify(layer or "layer", "layer")
    return f"{stamp}-{safe_layer}"

def _resolve_destination_path(path_value):
    raw = str(path_value or "").strip().strip('"')
    if not raw:
        raise ValueError("destinationPath is required for layer backup.")
    return _resolve_raw_path(raw)


def _build_unique_child_destination(parent_dir, layer):
    parent = Path(parent_dir).resolve()
    base_name = _default_backup_folder_name(layer)
    candidate = parent / base_name
    counter = 1
    while candidate.exists():
        candidate = parent / f"{base_name}-{counter}"
        counter += 1
    return candidate


def _ensure_destination_ready(destination, overwrite=False, layer="layer"):
    dest = Path(destination).resolve()
    if dest.exists() and not dest.is_dir():
        raise ValueError(f"Destination path is not a directory: {dest}")

    if overwrite:
        if dest.exists() and any(dest.iterdir()):
            shutil.rmtree(dest)
        dest.mkdir(parents=True, exist_ok=True)
        return dest

    # Non-overwrite backups always create a timestamped child folder under the
    # selected destination so tabs/_meta are never written directly to parent.
    dest.mkdir(parents=True, exist_ok=True)
    child = _build_unique_child_destination(dest, layer)
    child.mkdir(parents=True, exist_ok=False)
    return child


def handle_get_request(handler, path, query):
    with _STATE_LOCK:
        if path == "/api/eve-state/modular/status":
            status = _collect_status()
            _send_json(handler, HTTPStatus.OK, {"ok": True, **status})
            return True

        if path == "/api/eve-state/modular/path":
            active_root = get_active_store_root().resolve()
            selection = get_active_store_selection()
            _send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "activePath": str(selection.get("requestedPath") or active_root),
                "rootPath": str(active_root),
                "selection": selection,
                "defaultPath": str(DEFAULT_STORE_ROOT.resolve()),
                "settingsFile": str(STORE_SETTINGS_FILE.resolve()),
                "status": _collect_status()
            })
            return True

        if path == "/api/eve-state/modular/load":
            try:
                unified = read_modular_state()
                status = _collect_status()
                _send_json(handler, HTTPStatus.OK, {
                    "ok": True,
                    "state": unified,
                    "status": status
                })
            except FileNotFoundError:
                _send_json(handler, HTTPStatus.OK, {
                    "ok": True,
                    "state": None,
                    "status": _collect_status()
                })
            except Exception as exc:
                logger.exception("Failed to load modular state")
                _send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "ok": False,
                    "error": f"Failed to load modular state: {exc}"
                })
            return True

        if path == "/api/eve-state/modular/gemini-context":
            try:
                mode = (query.get("mode") or ["summary"])[0]
                sample_limit = (query.get("limit") or [25])[0]
                context = build_gemini_context(mode=mode, sample_limit=sample_limit)
                _send_json(handler, HTTPStatus.OK, {
                    "ok": True,
                    "mode": context["mode"],
                    "contextText": context["contextText"],
                    "payload": context["payload"]
                })
            except FileNotFoundError:
                _send_json(handler, HTTPStatus.OK, {
                    "ok": False,
                    "error": "Modular state store not found."
                })
            except Exception as exc:
                logger.exception("Failed to build Gemini context from modular state")
                _send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "ok": False,
                    "error": f"Failed to build Gemini context: {exc}"
                })
            return True

        return False


def handle_post_request(handler, path):
    with _STATE_LOCK:
        if path == "/api/eve-state/modular/pick-folder":
            payload = {}
            try:
                content_length = int(handler.headers.get("Content-Length", "0"))
            except ValueError:
                content_length = 0
            if content_length > 0:
                payload, error = _read_request_json(handler)
                if error:
                    _send_json(handler, HTTPStatus.BAD_REQUEST, {"ok": False, "error": error})
                    return True
            payload = payload or {}
            initial_path = str(payload.get("initialPath") or "").strip()
            try:
                picked_path = _pick_folder_path_native(initial_path)
                _send_json(handler, HTTPStatus.OK, {
                    "ok": True,
                    "path": picked_path,
                    "canceled": not bool(picked_path)
                })
            except Exception as exc:
                logger.exception("Failed to open native folder picker")
                _send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "ok": False,
                    "error": f"Failed to open folder picker: {exc}"
                })
            return True

        if path == "/api/eve-state/modular/path":
            payload, error = _read_request_json(handler)
            if error:
                _send_json(handler, HTTPStatus.BAD_REQUEST, {"ok": False, "error": error})
                return True

            requested_path = payload.get("path")
            create_if_missing = bool(payload.get("createIfMissing"))
            try:
                if str(requested_path or "").strip().lower() in {"", "default", "<default>"}:
                    resolved = set_active_store_root(DEFAULT_STORE_ROOT, create_if_missing=create_if_missing, persist=True)
                else:
                    resolved = set_active_store_root(requested_path, create_if_missing=create_if_missing, persist=True)
                selection = get_active_store_selection()
                _send_json(handler, HTTPStatus.OK, {
                    "ok": True,
                    "activePath": str(selection.get("requestedPath") or resolved),
                    "rootPath": str(resolved),
                    "selection": selection,
                    "defaultPath": str(DEFAULT_STORE_ROOT.resolve()),
                    "status": _collect_status()
                })
            except Exception as exc:
                _send_json(handler, HTTPStatus.BAD_REQUEST, {
                    "ok": False,
                    "error": f"Failed to set modular store path: {exc}"
                })
            return True

        if path == "/api/eve-state/modular/normalize-filenames":
            try:
                status = normalize_modular_bookmark_filenames()
                _send_json(handler, HTTPStatus.OK, {
                    "ok": True,
                    "status": status
                })
            except FileNotFoundError as exc:
                _send_json(handler, HTTPStatus.BAD_REQUEST, {
                    "ok": False,
                    "error": str(exc)
                })
            except Exception as exc:
                logger.exception("Failed to normalize modular bookmark filenames")
                _send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "ok": False,
                    "error": f"Failed to normalize modular bookmark filenames: {exc}"
                })
            return True

        if path == "/api/eve-state/modular/backup-layer":
            payload, error = _read_request_json(handler)
            if error:
                _send_json(handler, HTTPStatus.BAD_REQUEST, {"ok": False, "error": error})
                return True

            layer = str(payload.get("layer") or "").strip().lower()
            if layer not in VALID_LAYER_SCOPES:
                _send_json(handler, HTTPStatus.BAD_REQUEST, {
                    "ok": False,
                    "error": "layer must be one of: store, tab, card, bookmark"
                })
                return True

            workspace_id = str(payload.get("workspaceId") or "").strip()
            category_name = str(payload.get("categoryName") or "").strip()
            bookmark_id = str(payload.get("bookmarkId") or "").strip()
            destination_path = payload.get("destinationPath")
            overwrite = bool(payload.get("overwrite"))

            try:
                # Respect currently loaded scope (store/tab/card/bookmark) so
                # backups match what the user is actively viewing in EveOS.
                source_state = read_modular_state()
                layer_state = _extract_layer_state(
                    source_state,
                    layer=layer,
                    workspace_id=workspace_id,
                    category_name=category_name,
                    bookmark_id=bookmark_id
                )
                destination_root = _resolve_destination_path(destination_path)
                destination_root = _ensure_destination_ready(destination_root, overwrite=overwrite, layer=layer)
                if layer == "card":
                    result = _write_card_layer_backup_to_root(layer_state, destination_root)
                else:
                    result = _write_state_to_root(layer_state, destination_root)
                _send_json(handler, HTTPStatus.OK, {
                    "ok": True,
                    "layer": layer,
                    "destinationPath": str(destination_root),
                    "summary": result.get("summary") or {},
                    "status": result.get("status") or {},
                    "activeStorePath": str(get_active_store_root())
                })
            except Exception as exc:
                logger.exception("Failed to backup modular layer")
                _send_json(handler, HTTPStatus.BAD_REQUEST, {
                    "ok": False,
                    "error": f"Failed to backup layer: {exc}"
                })
            return True

        if path == "/api/eve-state/modular/import-layer":
            payload, error = _read_request_json(handler)
            if error:
                _send_json(handler, HTTPStatus.BAD_REQUEST, {"ok": False, "error": error})
                return True

            layer = str(payload.get("layer") or "").strip().lower()
            source_path = payload.get("sourcePath")
            if not source_path:
                _send_json(handler, HTTPStatus.BAD_REQUEST, {
                    "ok": False,
                    "error": "sourcePath is required for layer import."
                })
                return True

            try:
                source_root = _resolve_store_path(source_path)
                if not source_root.exists() or not source_root.is_dir():
                    raise FileNotFoundError(f"Import source folder not found: {source_root}")

                incoming_state = _read_state_from_root(source_root)
                inferred_type = str((incoming_state.get("metadata") or {}).get("type") or "").strip().lower()
                if not layer and inferred_type:
                    layer = "tab" if inferred_type == "workspace" else inferred_type
                if layer not in VALID_LAYER_SCOPES:
                    raise ValueError("layer must be one of: store, tab, card, bookmark")

                workspace_id = str(
                    payload.get("workspaceId")
                    or (incoming_state.get("metadata") or {}).get("workspaceId")
                    or ""
                ).strip()
                category_name = str(
                    payload.get("categoryName")
                    or (incoming_state.get("metadata") or {}).get("categoryName")
                    or ""
                ).strip()
                bookmark_id = str(
                    payload.get("bookmarkId")
                    or (incoming_state.get("metadata") or {}).get("bookmarkId")
                    or ""
                ).strip()

                try:
                    current_state = read_modular_state()
                except FileNotFoundError:
                    current_state = _empty_unified_state()

                merged = _merge_layer_state(
                    current_state,
                    incoming_state,
                    layer=layer,
                    workspace_id=workspace_id,
                    category_name=category_name,
                    bookmark_id=bookmark_id
                )
                result = write_modular_state(merged)
                _send_json(handler, HTTPStatus.OK, {
                    "ok": True,
                    "layer": layer,
                    "sourcePath": str(source_root),
                    "summary": result.get("summary") or {},
                    "status": result.get("status") or _collect_status()
                })
            except Exception as exc:
                logger.exception("Failed to import modular layer")
                _send_json(handler, HTTPStatus.BAD_REQUEST, {
                    "ok": False,
                    "error": f"Failed to import layer: {exc}"
                })
            return True

        if path != "/api/eve-state/modular/save":
            return False

        payload, error = _read_request_json(handler)
        if error:
            _send_json(handler, HTTPStatus.BAD_REQUEST, {"ok": False, "error": error})
            return True

        if not isinstance(payload, dict) or "bookmarks" not in payload:
            _send_json(handler, HTTPStatus.BAD_REQUEST, {
                "ok": False,
                "error": "Expected unified state JSON payload."
            })
            return True

        try:
            result = write_modular_state(payload)
            _send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "summary": result.get("summary") or {},
                "status": result.get("status") or _collect_status()
            })
        except Exception as exc:
            logger.exception("Failed to save modular state")
            _send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
                "ok": False,
                "error": f"Failed to save modular state: {exc}"
            })
        return True
