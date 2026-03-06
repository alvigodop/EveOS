import json
from http import HTTPStatus


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


def handle_get_request(handler, path, query, deps):
    collect_status = deps["collect_status"]
    build_gemini_context = deps["build_gemini_context"]
    default_store_root = deps["default_store_root"]
    get_active_store_root = deps["get_active_store_root"]
    get_active_store_selection = deps["get_active_store_selection"]
    logger = deps["logger"]
    read_modular_state = deps["read_modular_state"]
    settings_file = deps["settings_file"]

    if path == "/api/eve-state/modular/status":
        status = collect_status()
        send_json(handler, HTTPStatus.OK, {"ok": True, **status})
        return True

    if path == "/api/eve-state/modular/path":
        active_root = get_active_store_root().resolve()
        selection = get_active_store_selection()
        send_json(handler, HTTPStatus.OK, {
            "ok": True,
            "activePath": str(selection.get("requestedPath") or active_root),
            "rootPath": str(active_root),
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
    collect_status = deps["collect_status"]
    default_store_root = deps["default_store_root"]
    empty_unified_state = deps["empty_unified_state"]
    ensure_destination_ready = deps["ensure_destination_ready"]
    extract_layer_state = deps["extract_layer_state"]
    get_active_store_root = deps["get_active_store_root"]
    get_active_store_selection = deps["get_active_store_selection"]
    logger = deps["logger"]
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
                "error": "layer must be one of: store, tab, card, bookmark",
            })
            return True

        workspace_id = str(payload.get("workspaceId") or "").strip()
        category_name = str(payload.get("categoryName") or "").strip()
        bookmark_id = str(payload.get("bookmarkId") or "").strip()
        destination_path = payload.get("destinationPath")
        overwrite = bool(payload.get("overwrite"))

        try:
            source_state = read_modular_state()
            layer_state = extract_layer_state(
                source_state,
                layer=layer,
                workspace_id=workspace_id,
                category_name=category_name,
                bookmark_id=bookmark_id,
            )
            destination_root = resolve_destination_path(destination_path)
            destination_root = ensure_destination_ready(destination_root, overwrite=overwrite, layer=layer)
            if layer == "card":
                result = write_card_layer_backup_to_root(layer_state, destination_root)
            else:
                result = write_state_to_root(layer_state, destination_root)
            send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "layer": layer,
                "destinationPath": str(destination_root),
                "summary": result.get("summary") or {},
                "status": result.get("status") or {},
                "activeStorePath": str(get_active_store_root()),
            })
        except Exception as exc:
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
                current_state = empty_unified_state()

            merged = merge_layer_state(
                current_state,
                incoming_state,
                layer=layer,
                workspace_id=workspace_id,
                category_name=category_name,
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
        result = write_modular_state(payload)
        send_json(handler, HTTPStatus.OK, {
            "ok": True,
            "summary": result.get("summary") or {},
            "status": result.get("status") or collect_status(),
        })
    except Exception as exc:
        logger.exception("Failed to save modular state")
        send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
            "ok": False,
            "error": f"Failed to save modular state: {exc}",
        })
    return True
