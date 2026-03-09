import hashlib
import json
import logging
import os
import shutil
import threading
import tempfile
from contextlib import contextmanager
from pathlib import Path

from server_modules.eve_state_store_api import (
    handle_get_request as _handle_get_request_api,
    handle_post_request as _handle_post_request_api,
)
from server_modules.eve_state_store_layers import (
    VALID_LAYER_SCOPES,
    build_gemini_context_from_state as _build_gemini_context_from_state,
    empty_unified_state as _empty_unified_state,
    ensure_destination_ready as _ensure_destination_ready,
    extract_layer_state as _extract_layer_state,
    merge_layer_state as _merge_layer_state,
    resolve_destination_path as _resolve_destination_path,
)
from server_modules.eve_state_store_files import (
    build_bookmark_filename as _build_bookmark_filename,
    build_library_index as _build_library_index,
    build_workspaces as _build_workspaces,
    clean_name_segment as _clean_name_segment,
    connection_category_name as _connection_category_name,
    connection_entry_id as _connection_entry_id,
    extract_bookmark_dict as _extract_bookmark_dict,
    folder_name as _folder_name,
    load_json_file as _load_json_file,
    merge_card_folders as _merge_card_folders,
    merge_unlinked_library_files as _merge_unlinked_library_files,
    move_bookmark_file as _move_bookmark_file,
    normalize_bookmark_filename as _normalize_bookmark_filename,
    normalize_workspace_card_layout as _normalize_workspace_card_layout,
    parse_scoped_category_key as _parse_scoped_category_key,
    paths_equal as _paths_equal,
    prepare_workspace_map as _prepare_workspace_map,
    read_bookmark_id_from_file as _read_bookmark_id_from_file,
    resolve_bookmark_folder as _resolve_bookmark_folder,
    resolve_card_category_name as _resolve_card_category_name,
    safe_filename as _safe_filename,
    scoped_key as _scoped_key,
    slugify as _slugify,
    upsert_card_metadata as _upsert_card_metadata,
)
from server_modules.eve_state_store_io import (
    read_modular_state_raw as _read_modular_state_raw,
    write_modular_state_full as _write_modular_state_full_io,
)
from server_modules.eve_state_store_paths import (
    coerce_store_root as _coerce_store_root,
    infer_category_from_card_folder as _infer_category_from_card_folder,
    infer_workspace_from_card_folder as _infer_workspace_from_card_folder,
    infer_workspace_from_cards_root as _infer_workspace_from_cards_root,
    infer_workspace_from_tab_folder as _infer_workspace_from_tab_folder,
    looks_like_card_folder as _looks_like_card_folder,
    looks_like_store_root as _looks_like_store_root,
    looks_like_tab_folder as _looks_like_tab_folder,
    looks_like_tabs_root as _looks_like_tabs_root,
    read_json_dict as _read_json_dict,
    resolve_raw_path as _resolve_raw_path,
    resolve_store_path as _resolve_store_path,
    resolve_store_target as _resolve_store_target,
)
from server_modules.eve_state_store_session import (
    build_store_paths as _build_store_paths,
    load_store_settings_path as _load_store_settings_path_raw,
    pick_folder_path_native as _pick_folder_path_native_raw,
    resolve_active_store_change as _resolve_active_store_change,
    save_store_settings as _save_store_settings_raw,
)

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
    "folderId": "",
    "bookmarkId": "",
    "requestedPath": str(DEFAULT_STORE_ROOT.resolve())
}


def _pick_folder_path_native(initial_path=""):
    return _pick_folder_path_native_raw(_resolve_raw_path, initial_path=initial_path)


def _set_store_root_paths(path_value):
    global STORE_ROOT, META_DIR, TABS_DIR
    STORE_ROOT, META_DIR, TABS_DIR = _build_store_paths(_resolve_store_path, path_value)
    return STORE_ROOT


def _save_store_settings(active_path, requested_path=None):
    _save_store_settings_raw(
        DATA_ROOT,
        STORE_SETTINGS_FILE,
        STORE_SETTINGS_VERSION,
        active_path,
        requested_path=requested_path,
    )


def _load_store_settings_path():
    return _load_store_settings_path_raw(
        DEFAULT_STORE_ROOT,
        STORE_SETTINGS_FILE,
        _resolve_raw_path,
        _resolve_store_path,
        logger,
    )


def get_active_store_root():
    return STORE_ROOT


def get_active_store_selection():
    return dict(ACTIVE_STORE_SELECTION)


def set_active_store_root(path_value, create_if_missing=False, persist=True):
    global ACTIVE_STORE_SELECTION
    requested, resolved, selection = _resolve_active_store_change(
        path_value,
        create_if_missing=create_if_missing,
        resolve_store_target=_resolve_store_target,
        logger=logger,
    )
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
    startup_path, repaired_settings = _load_store_settings_path()
    resolved_startup_root = set_active_store_root(startup_path, create_if_missing=False, persist=False)
    if repaired_settings:
        _save_store_settings(resolved_startup_root, requested_path=str(resolved_startup_root))
except Exception as exc:
    logger.warning("Failed to load modular store path from settings: %s", exc)
    _set_store_root_paths(DEFAULT_STORE_ROOT)



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


def build_gemini_context(mode="summary", sample_limit=25):
    state = read_modular_state()
    return _build_gemini_context_from_state(state, mode=mode, sample_limit=sample_limit)


def _write_modular_state_full(state):
    return _write_modular_state_full_io(
        state,
        store_root=STORE_ROOT,
        meta_dir=META_DIR,
        tabs_dir=TABS_DIR,
        format_version=FORMAT_VERSION,
        ensure_clean_store=_ensure_clean_store,
        collect_status=_collect_status,
    )


def write_modular_state(state):
    if not isinstance(state, dict):
        raise ValueError("State payload must be a JSON object.")

    selection = get_active_store_selection()
    layer = str(selection.get("layer") or "store").strip().lower()
    if layer not in {"tab", "card", "folder", "bookmark"}:
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
        folder_id=str(selection.get("folderId") or "").strip(),
        bookmark_id=str(selection.get("bookmarkId") or "").strip()
    )
    return _write_modular_state_full(merged_state)


def read_modular_state(apply_selection=True):
    unified = _read_modular_state_raw(
        store_root=STORE_ROOT,
        meta_dir=META_DIR,
        tabs_dir=TABS_DIR,
        format_version=FORMAT_VERSION,
    )

    if not apply_selection:
        return unified

    selection = get_active_store_selection()
    layer = str(selection.get("layer") or "store").strip().lower()
    if layer not in {"tab", "card", "folder", "bookmark"}:
        return unified

    try:
        return _extract_layer_state(
            unified,
            layer=layer,
            workspace_id=str(selection.get("workspaceId") or "").strip(),
            category_name=str(selection.get("categoryName") or "").strip(),
            folder_id=str(selection.get("folderId") or "").strip(),
            bookmark_id=str(selection.get("bookmarkId") or "").strip(),
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


def _write_folder_layer_backup_to_root(state, root_path):
    """
    Write a folder-layer backup with structure starting at:
      <root>/cards/<card>/...
    and include a folder-scoped restore snapshot at:
      <root>/state/folder-state.json
    """
    target_root = Path(root_path).resolve()
    temp_root = Path(tempfile.mkdtemp(prefix="eveos-folder-layer-"))
    try:
        with _temporary_store_root(temp_root):
            _write_modular_state_full(state)

        state_root = target_root / "state"
        state_root.mkdir(parents=True, exist_ok=True)
        (state_root / "folder-state.json").write_text(
            json.dumps(state, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

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

def _build_api_deps():
    return {
        "collect_status": _collect_status,
        "build_gemini_context": build_gemini_context,
        "default_store_root": DEFAULT_STORE_ROOT,
        "empty_unified_state": _empty_unified_state,
        "ensure_destination_ready": _ensure_destination_ready,
        "extract_layer_state": _extract_layer_state,
        "get_active_store_root": get_active_store_root,
        "get_active_store_selection": get_active_store_selection,
        "logger": logger,
        "merge_layer_state": _merge_layer_state,
        "normalize_modular_bookmark_filenames": normalize_modular_bookmark_filenames,
        "pick_folder_path_native": _pick_folder_path_native,
        "read_modular_state": read_modular_state,
        "read_state_from_root": _read_state_from_root,
        "resolve_destination_path": _resolve_destination_path,
        "resolve_store_path": _resolve_store_path,
        "set_active_store_root": set_active_store_root,
        "settings_file": STORE_SETTINGS_FILE,
        "valid_layer_scopes": VALID_LAYER_SCOPES,
        "write_card_layer_backup_to_root": _write_card_layer_backup_to_root,
        "write_folder_layer_backup_to_root": _write_folder_layer_backup_to_root,
        "write_modular_state": write_modular_state,
        "write_state_to_root": _write_state_to_root,
    }


def handle_get_request(handler, path, query):
    with _STATE_LOCK:
        return _handle_get_request_api(handler, path, query, _build_api_deps())


def handle_post_request(handler, path):
    with _STATE_LOCK:
        return _handle_post_request_api(handler, path, _build_api_deps())
