# Recovery HTTP helpers -----------------------------------------------------

def send_file_download(handler, path: Path, filename: str, content_type: str) -> None:
    size = path.stat().st_size
    handler.send_response(HTTPStatus.OK)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Disposition", f'attachment; filename="{filename}"')
    handler.send_header("Content-Length", str(size))
    handler.end_headers()
    try:
        with path.open("rb") as source:
            shutil.copyfileobj(source, handler.wfile, 1024 * 1024)
    finally:
        path.unlink(missing_ok=True)


def handle_recovery_get(handler, parsed) -> bool:
    if parsed.path != "/api/recovery/export":
        return False
    path, filename, summary = create_full_recovery_backup()
    send_file_download(handler, path, filename, "application/zip")
    return True


def handle_recovery_post_raw(handler, parsed) -> bool:
    if parsed.path != "/api/recovery/inspect":
        return False
    result = store_recovery_upload(handler)
    handler.send_json({"ok": True, **result})
    return True


def handle_recovery_post_json(handler, parsed, payload: dict) -> bool:
    if parsed.path != "/api/recovery/restore":
        return False
    result = restore_recovery_backup(
        str(payload.get("uploadId") or ""),
        str(payload.get("mode") or "everything"),
        str(payload.get("destinationPath") or ""),
        str(payload.get("conflictPolicy") or "new-folder"),
    )
    handler.send_json({"ok": True, **result})
    return True
