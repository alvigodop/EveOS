import json
import shutil
from pathlib import Path
from http import HTTPStatus

from server_modules.eve_state_store_files import (
    build_workspace_folder_parts,
    build_bookmark_filename,
    build_bookmark_folder_dirname,
    find_workspace_node,
    folder_name,
    normalize_bookmark_folder_tree,
    scoped_key,
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


def _query_value(query, key, default=""):
    values = query.get(key) or []
    if not values:
        return default
    return str(values[0] or default).strip()


def _normalize_layer_scope(value):
    scope = str(value or "store").strip().lower()
    return scope if scope in {"store", "tab", "card", "folder", "bookmark"} else "store"


def _build_folder_chain_parts(folder_tree, folder_id):
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


def _build_layer_preview_path(active_root, unified_state, *, layer, workspace_id, category_name, folder_id, bookmark_id):
    current_path = Path(active_root).resolve()
    scope = _normalize_layer_scope(layer)
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
            resolved_workspace_id
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
                None
            )
        if target_link and not effective_folder_id:
            effective_folder_id = str(target_link.get("folderId") or "").strip()

    scoped_folder_tree = folder_trees.get(scoped_key(resolved_workspace_id, resolved_category_name)) or {}
    folder_chain_parts = _build_folder_chain_parts(scoped_folder_tree, effective_folder_id)
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


def handle_get_request(handler, path, query, deps):
    collect_status = deps["collect_status"]
    build_gemini_context = deps["build_gemini_context"]
    default_store_root = deps["default_store_root"]
    get_active_store_root = deps["get_active_store_root"]
    get_active_store_selection = deps["get_active_store_selection"]
    get_operation_progress = deps.get("get_operation_progress")
    logger = deps["logger"]
    read_modular_state = deps["read_modular_state"]
    settings_file = deps["settings_file"]

    if path == "/api/eve-state/modular/status":
        status = collect_status()
        send_json(handler, HTTPStatus.OK, {"ok": True, **status})
        return True

    if path == "/api/eve-state/modular/progress":
        progress = get_operation_progress() if callable(get_operation_progress) else {"active": False}
        send_json(handler, HTTPStatus.OK, {"ok": True, "progress": progress})
        return True

    if path == "/api/eve-state/modular/path":
        active_root = get_active_store_root().resolve()
        selection = get_active_store_selection()
        layer = _normalize_layer_scope(_query_value(query, "layer", "store"))
        workspace_id = _query_value(query, "workspaceId", "")
        category_name = _query_value(query, "categoryName", "")
        folder_id = _query_value(query, "folderId", "")
        bookmark_id = _query_value(query, "bookmarkId", "")
        unified_state = None
        if any([workspace_id, category_name, folder_id, bookmark_id]) or layer != "store":
            try:
                unified_state = read_modular_state()
            except FileNotFoundError:
                unified_state = None
            except Exception:
                logger.exception("Failed to build modular layer path preview")
                unified_state = None
        send_json(handler, HTTPStatus.OK, {
            "ok": True,
            "activePath": str(selection.get("requestedPath") or active_root),
            "rootPath": str(active_root),
            "layer": layer,
            "layerPath": _build_layer_preview_path(
                active_root,
                unified_state,
                layer=layer,
                workspace_id=workspace_id,
                category_name=category_name,
                folder_id=folder_id,
                bookmark_id=bookmark_id,
            ),
            "selection": selection,
            "defaultPath": str(default_store_root.resolve()),
            "settingsFile": str(settings_file.resolve()),
            "status": collect_status(),
        })
        return True

    if path == "/api/eve-state/modular/load":
        try:
            unified = read_modular_state()
            status = collect_status()
            send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "state": unified,
                "status": status,
            })
        except FileNotFoundError:
            send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "state": None,
                "status": collect_status(),
            })
        except Exception as exc:
            logger.exception("Failed to load modular state")
            send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
                "ok": False,
                "error": f"Failed to load modular state: {exc}",
            })
        return True

    if path == "/api/eve-state/modular/gemini-context":
        try:
            mode = (query.get("mode") or ["summary"])[0]
            sample_limit = (query.get("limit") or [25])[0]
            context = build_gemini_context(mode=mode, sample_limit=sample_limit)
            send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "mode": context["mode"],
                "contextText": context["contextText"],
                "payload": context["payload"],
            })
        except FileNotFoundError:
            send_json(handler, HTTPStatus.OK, {
                "ok": False,
                "error": "Modular state store not found.",
            })
        except Exception as exc:
            logger.exception("Failed to build Gemini context from modular state")
            send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
                "ok": False,
                "error": f"Failed to build Gemini context: {exc}",
            })
        return True

    return False


def handle_post_request(handler, path, deps):
    begin_operation_progress = deps.get("begin_operation_progress")
    collect_status = deps["collect_status"]
    default_store_root = deps["default_store_root"]
    empty_unified_state = deps["empty_unified_state"]
    ensure_destination_ready = deps["ensure_destination_ready"]
    extract_layer_state = deps["extract_layer_state"]
    finish_operation_progress = deps.get("finish_operation_progress")
    get_active_store_root = deps["get_active_store_root"]
    get_active_store_selection = deps["get_active_store_selection"]
    logger = deps["logger"]
    make_progress_callback = deps.get("make_progress_callback")
    merge_layer_state = deps["merge_layer_state"]
    normalize_modular_bookmark_filenames = deps["normalize_modular_bookmark_filenames"]
    pick_folder_path_native = deps["pick_folder_path_native"]
    read_modular_state = deps["read_modular_state"]
    read_state_from_root = deps["read_state_from_root"]
    resolve_destination_path = deps["resolve_destination_path"]
    resolve_store_path = deps["resolve_store_path"]
    set_active_store_root = deps["set_active_store_root"]
    valid_layer_scopes = deps["valid_layer_scopes"]
    write_card_layer_backup_to_root = deps["write_card_layer_backup_to_root"]
    write_folder_layer_backup_to_root = deps["write_folder_layer_backup_to_root"]
    write_modular_state = deps["write_modular_state"]
    write_state_to_root = deps["write_state_to_root"]

    if path == "/api/eve-state/modular/pick-folder":
        payload = {}
        try:
            content_length = int(handler.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length > 0:
            payload, error = read_request_json(handler)
            if error:
                send_json(handler, HTTPStatus.BAD_REQUEST, {"ok": False, "error": error})
                return True
        payload = payload or {}
        initial_path = str(payload.get("initialPath") or "").strip()
        try:
            picked_path = pick_folder_path_native(initial_path)
            send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "path": picked_path,
                "canceled": not bool(picked_path),
            })
        except Exception as exc:
            logger.exception("Failed to open native folder picker")
            send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
                "ok": False,
                "error": f"Failed to open folder picker: {exc}",
            })
        return True

    if path == "/api/eve-state/modular/path":
        payload, error = read_request_json(handler)
        if error:
            send_json(handler, HTTPStatus.BAD_REQUEST, {"ok": False, "error": error})
            return True

        requested_path = payload.get("path")
        create_if_missing = bool(payload.get("createIfMissing"))
        try:
            if str(requested_path or "").strip().lower() in {"", "default", "<default>"}:
                resolved = set_active_store_root(default_store_root, create_if_missing=create_if_missing, persist=True)
            else:
                resolved = set_active_store_root(requested_path, create_if_missing=create_if_missing, persist=True)
            selection = get_active_store_selection()
            send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "activePath": str(selection.get("requestedPath") or resolved),
                "rootPath": str(resolved),
                "selection": selection,
                "defaultPath": str(default_store_root.resolve()),
                "status": collect_status(),
            })
        except Exception as exc:
            send_json(handler, HTTPStatus.BAD_REQUEST, {
                "ok": False,
                "error": f"Failed to set modular store path: {exc}",
            })
        return True

    if path == "/api/eve-state/modular/normalize-filenames":
        try:
            status = normalize_modular_bookmark_filenames()
            send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "status": status,
            })
        except FileNotFoundError as exc:
            send_json(handler, HTTPStatus.BAD_REQUEST, {
                "ok": False,
                "error": str(exc),
            })
        except Exception as exc:
            logger.exception("Failed to normalize modular bookmark filenames")
            send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
                "ok": False,
                "error": f"Failed to normalize modular bookmark filenames: {exc}",
            })
        return True

    if path == "/api/eve-state/modular/backup-layer":
        payload, error = read_request_json(handler)
        if error:
            send_json(handler, HTTPStatus.BAD_REQUEST, {"ok": False, "error": error})
            return True

        layer = str(payload.get("layer") or "").strip().lower()
        if layer not in valid_layer_scopes:
            send_json(handler, HTTPStatus.BAD_REQUEST, {
                "ok": False,
                "error": "layer must be one of: store, tab, card, folder, bookmark",
            })
            return True

        workspace_id = str(payload.get("workspaceId") or "").strip()
        category_name = str(payload.get("categoryName") or "").strip()
        folder_id = str(payload.get("folderId") or "").strip()
        bookmark_id = str(payload.get("bookmarkId") or "").strip()
        destination_path = payload.get("destinationPath")
        overwrite = bool(payload.get("overwrite"))
        destination_root = None
        progress_callback = make_progress_callback(kind="backup") if callable(make_progress_callback) else None

        try:
            if callable(begin_operation_progress):
                begin_operation_progress(
                    kind="backup",
                    phase="preparing",
                    message=f"Preparing {layer or 'store'} backup",
                    layer=layer,
                )
            source_state = read_modular_state()
            layer_state = extract_layer_state(
                source_state,
                layer=layer,
                workspace_id=workspace_id,
                category_name=category_name,
                folder_id=folder_id,
                bookmark_id=bookmark_id,
            )
            destination_root = resolve_destination_path(destination_path)
            destination_root = ensure_destination_ready(destination_root, overwrite=overwrite, layer=layer)
            if layer == "card":
                result = write_card_layer_backup_to_root(
                    layer_state,
                    destination_root,
                    progress_callback=progress_callback,
                )
            elif layer == "folder":
                result = write_folder_layer_backup_to_root(
                    layer_state,
                    destination_root,
                    progress_callback=progress_callback,
                )
            else:
                result = write_state_to_root(
                    layer_state,
                    destination_root,
                    progress_callback=progress_callback,
                )
            if callable(finish_operation_progress):
                finish_operation_progress(
                    ok=True,
                    kind="backup",
                    phase="complete",
                    message=f"{layer or 'store'} backup complete",
                    layer=layer,
                    destinationPath=str(destination_root),
                    summary=result.get("summary") or {},
                )
            send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "layer": layer,
                "destinationPath": str(destination_root),
                "summary": result.get("summary") or {},
                "status": result.get("status") or {},
                "activeStorePath": str(get_active_store_root()),
            })
        except Exception as exc:
            if destination_root is not None and not overwrite:
                try:
                    if destination_root.exists() and destination_root.is_dir():
                        shutil.rmtree(destination_root)
                except Exception:
                    logger.warning("Failed to remove partial layer backup folder after error: %s", destination_root)
            if callable(finish_operation_progress):
                finish_operation_progress(
                    ok=False,
                    kind="backup",
                    phase="error",
                    message=f"{layer or 'store'} backup failed",
                    layer=layer,
                    error=str(exc),
                )
            logger.exception("Failed to backup modular layer")
            send_json(handler, HTTPStatus.BAD_REQUEST, {
                "ok": False,
                "error": f"Failed to backup layer: {exc}",
            })
        return True

    if path == "/api/eve-state/modular/import-layer":
        payload, error = read_request_json(handler)
        if error:
            send_json(handler, HTTPStatus.BAD_REQUEST, {"ok": False, "error": error})
            return True

        layer = str(payload.get("layer") or "").strip().lower()
        source_path = payload.get("sourcePath")
        if not source_path:
            send_json(handler, HTTPStatus.BAD_REQUEST, {
                "ok": False,
                "error": "sourcePath is required for layer import.",
            })
            return True

        try:
            source_root = resolve_store_path(source_path)
            if not source_root.exists() or not source_root.is_dir():
                raise FileNotFoundError(f"Import source folder not found: {source_root}")

            incoming_state = read_state_from_root(source_root)
            inferred_type = str((incoming_state.get("metadata") or {}).get("type") or "").strip().lower()
            if not layer and inferred_type:
                layer = "tab" if inferred_type == "workspace" else inferred_type
            if layer not in valid_layer_scopes:
                raise ValueError("layer must be one of: store, tab, card, folder, bookmark")

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
            folder_id = str(
                payload.get("folderId")
                or (incoming_state.get("metadata") or {}).get("folderId")
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
                current_state = empty_unified_state()

            merged = merge_layer_state(
                current_state,
                incoming_state,
                layer=layer,
                workspace_id=workspace_id,
                category_name=category_name,
                folder_id=folder_id,
                bookmark_id=bookmark_id,
            )
            result = write_modular_state(merged)
            send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "layer": layer,
                "sourcePath": str(source_root),
                "summary": result.get("summary") or {},
                "status": result.get("status") or collect_status(),
            })
        except Exception as exc:
            logger.exception("Failed to import modular layer")
            send_json(handler, HTTPStatus.BAD_REQUEST, {
                "ok": False,
                "error": f"Failed to import layer: {exc}",
            })
        return True

    if path != "/api/eve-state/modular/save":
        return False

    payload, error = read_request_json(handler)
    if error:
        send_json(handler, HTTPStatus.BAD_REQUEST, {"ok": False, "error": error})
        return True

    if not isinstance(payload, dict) or "bookmarks" not in payload:
        send_json(handler, HTTPStatus.BAD_REQUEST, {
            "ok": False,
            "error": "Expected unified state JSON payload.",
        })
        return True

    try:
        if callable(begin_operation_progress):
            begin_operation_progress(
                kind="save",
                phase="preparing",
                message="Preparing modular save",
                layer="store",
            )
        progress_callback = make_progress_callback(kind="save") if callable(make_progress_callback) else None
        result = write_modular_state(payload, progress_callback=progress_callback)
        if callable(finish_operation_progress):
            finish_operation_progress(
                ok=True,
                kind="save",
                phase="complete",
                message="Modular save complete",
                layer="store",
                summary=result.get("summary") or {},
            )
        send_json(handler, HTTPStatus.OK, {
            "ok": True,
            "summary": result.get("summary") or {},
            "status": result.get("status") or collect_status(),
        })
    except Exception as exc:
        if callable(finish_operation_progress):
            finish_operation_progress(
                ok=False,
                kind="save",
                phase="error",
                message="Modular save failed",
                layer="store",
                error=str(exc),
            )
        logger.exception("Failed to save modular state")
        send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
            "ok": False,
            "error": f"Failed to save modular state: {exc}",
        })
    return True
