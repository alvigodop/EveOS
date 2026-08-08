# Reader-document HTTP route adapters -------------------------------------

def receive_narration_upload(handler) -> dict:
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length <= 0:
        raise ValueError("Choose a document to import.")
    if length > MAX_REQUEST_BYTES:
        raise ValueError("Reader document exceeds the 100 MB upload limit.")
    filename = unquote(str(handler.headers.get("X-Eve-File-Name") or "document.txt"))
    safe_name = Path(filename).name
    suffix = Path(safe_name).suffix.casefold()
    if suffix not in NARRATION_EXTENSIONS:
        raise ValueError("Reader documents must be PDF, DOCX, TXT, Markdown, or HTML.")
    NARRATION_DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = NARRATION_DOCUMENTS_DIR / f".{new_id('upload')}{suffix}"
    remaining = length
    try:
        with temp_path.open("wb") as output:
            while remaining:
                chunk = handler.rfile.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise ValueError("Reader document upload ended unexpectedly.")
                output.write(chunk)
                remaining -= len(chunk)
        text, format_name = extract_narration_text(temp_path)
        return save_narration_document(Path(safe_name).stem, text, temp_path, format_name)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


def send_narration_source(handler, document_id: str) -> None:
    record = get_narration_document(document_id, include_text=False)
    source_name = Path(str(record.get("sourceFile") or "")).name
    if not source_name:
        raise FileNotFoundError("This pasted reader document has no original source file.")
    source = narration_document_dir(document_id) / source_name
    if not source.is_file():
        raise FileNotFoundError("Reader document source file was not found.")
    filename = re.sub(r"[^A-Za-z0-9._-]+", "-", str(record.get("title") or "document"))
    filename = f"{filename}{source.suffix}"
    body = source.read_bytes()
    handler.send_response(HTTPStatus.OK)
    handler.send_header("Content-Type", mimetypes.guess_type(filename)[0] or "application/octet-stream")
    handler.send_header("Content-Disposition", f'attachment; filename="{filename}"')
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def handle_narration_get(handler, parsed, query: dict) -> bool:
    if parsed.path == "/api/narration/documents":
        handler.send_json({"ok": True, "documents": list_narration_documents()})
        return True
    if parsed.path == "/api/narration/document":
        document_id = query.get("id", [""])[0]
        handler.send_json({"ok": True, "document": get_narration_document(document_id)})
        return True
    if parsed.path == "/api/narration/document/download":
        send_narration_source(handler, query.get("id", [""])[0])
        return True
    return False


def handle_narration_post_raw(handler, parsed) -> bool:
    if parsed.path != "/api/narration/documents/import":
        return False
    record = receive_narration_upload(handler)
    handler.send_json({"ok": True, "document": record}, HTTPStatus.CREATED)
    return True


def handle_narration_post_json(handler, parsed, payload: dict) -> bool:
    if parsed.path != "/api/narration/documents/text":
        return False
    record = save_narration_document(
        str(payload.get("title") or "Pasted text"),
        str(payload.get("text") or ""),
    )
    handler.send_json({"ok": True, "document": record}, HTTPStatus.CREATED)
    return True


def handle_narration_delete(handler, parsed, query: dict) -> bool:
    if parsed.path != "/api/narration/document":
        return False
    record = delete_narration_document(query.get("id", [""])[0])
    handler.send_json({"ok": True, "deleted": record})
    return True
