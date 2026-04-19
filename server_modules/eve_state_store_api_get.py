from http import HTTPStatus

from server_modules.eve_state_store_api_helpers import (
    build_layer_preview_path,
    normalize_layer_scope,
    query_value,
    send_json,
)


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
        layer = normalize_layer_scope(query_value(query, "layer", "store"))
        workspace_id = query_value(query, "workspaceId", "")
        category_name = query_value(query, "categoryName", "")
        folder_id = query_value(query, "folderId", "")
        bookmark_id = query_value(query, "bookmarkId", "")
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
            "layerPath": build_layer_preview_path(
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
