import hashlib
import json
import logging
import os
import shutil
import threading
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime
from http import HTTPStatus
from pathlib import Path

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
    if layer not in {"tab", "card", "bookmark"}:
        return unified

    try:
        return _extract_layer_state(
            unified,
            layer=layer,
            workspace_id=str(selection.get("workspaceId") or "").strip(),
            category_name=str(selection.get("categoryName") or "").strip(),
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
