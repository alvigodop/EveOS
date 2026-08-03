def virtual_path_records(node_id: str) -> list[dict]:
    path: list[dict] = []

    def visit(node: dict, current: list[dict]) -> bool:
        next_path = [*current, node]
        if node.get("id") == node_id:
            path.extend(next_path)
            return True
        for child in node.get("children") or []:
            if visit(child, next_path):
                return True
        return False

    visit(STATE.get("virtualRoot", {}), [])
    return path



def virtual_effective_tag_details(node_id: str) -> list[dict]:
    path = virtual_path_records(node_id)
    if not path:
        return []

    current = path[-1]
    visible = {tag.casefold() for tag in normalize_tags(current.get("visibleTags"))}
    records: dict[str, dict] = {}

    def add(name: str, source_type: str, origin: str) -> None:
        clean = str(name or "").strip()
        if not clean:
            return
        key = clean.casefold()
        record = records.setdefault(key, {"name": clean, "sources": []})
        source = {"type": source_type, "origin": origin}
        if source not in record["sources"]:
            record["sources"].append(source)

    for tag in normalize_tags(current.get("tags")):
        add(tag, "manual", "This entry")

    for ancestor in path[:-1]:
        if ancestor.get("id") == (STATE.get("virtualRoot") or {}).get("id"):
            continue
        for tag in normalize_tags(ancestor.get("sharedTags")):
            add(tag, "shared", str(ancestor.get("name") or "Parent folder"))

    if (STATE.get("tagAutomation") or {}).get("pathTagsEnabled", True):
        for ancestor in path[2:-1]:
            add(str(ancestor.get("name") or ""), "path", str(ancestor.get("name") or ""))

    rank = {"manual": 0, "shared": 1, "path": 2}
    details = []
    for record in records.values():
        record["sources"].sort(key=lambda source: rank.get(source.get("type"), 99))
        record["visible"] = record["name"].casefold() in visible
        details.append(record)
    details.sort(
        key=lambda record: (
            min(rank.get(source.get("type"), 99) for source in record["sources"]),
            record["name"].casefold(),
        )
    )
    return details


def virtual_effective_tags(node_id: str) -> list[str]:
    return [record["name"] for record in virtual_effective_tag_details(node_id)]

def build_snapshot() -> dict:
    root = configured_root()
    entries = []
    total_chars = 0
    skipped = []

    with LOCK:
        state_copy = json.loads(json.dumps(STATE))

    def enrich(info: dict, relative: str) -> dict:
        metadata = state_copy.get("fileMeta", {}).get(relative, {})
        manual_tags = normalize_tags(metadata.get("tags"))
        info.update({
            "status": str(metadata.get("status") or "draft"),
            "tags": manual_tags,
            "effectiveTags": manual_tags,
            "manualTags": manual_tags,
            "sharedTags": normalize_tags(metadata.get("sharedTags")),
            "visibleTags": normalize_tags(metadata.get("visibleTags")),
            "notes": str(metadata.get("notes") or ""),
            "links": virtual_link_details(metadata.get("links")),
            "metaUpdatedAt": metadata.get("updatedAt") or "",
        })
        return info

    for current, folders, files in os.walk(root):
        current_path = Path(current)
        folders.sort(key=str.lower)
        files.sort(key=str.lower)

        for folder_name in folders:
            path = current_path / folder_name
            try:
                rel = path.relative_to(root).as_posix()
                entries.append(enrich(entry_info(path, rel), rel))
            except (PermissionError, OSError) as exc:
                skipped.append({"path": str(path), "reason": str(exc)})

        for file_name in files:
            path = current_path / file_name
            try:
                rel = path.relative_to(root).as_posix()
                info = enrich(entry_info(path, rel), rel)

                if info["readable"]:
                    try:
                        content, editable, format_name = read_supported_file(path)
                        if total_chars + len(content) <= MAX_TOTAL_SNAPSHOT_CHARS:
                            info["content"] = content
                            info["contentFormat"] = format_name
                            info["editable"] = editable
                            total_chars += len(content)
                        else:
                            info["contentSkipped"] = "Snapshot readable-content limit reached."
                    except Exception as exc:
                        info["contentSkipped"] = str(exc)

                entries.append(info)
            except (PermissionError, OSError) as exc:
                skipped.append({"path": str(path), "reason": str(exc)})

    return {
        "schemaVersion": SCHEMA_VERSION,
        "appVersion": APP_VERSION,
        "exportedAt": now_iso(),
        "project": state_copy.get("project", {}),
        "workspace": {
            "rootName": root.name,
            "rootPathAtExport": str(root),
        },
        "worldBookState": state_copy,
        "physicalSnapshot": {
            "entries": entries,
            "readableCharacterCount": total_chars,
            "skipped": skipped,
        },
    }


def normalize_import_name(snapshot: dict) -> str:
    project = snapshot.get("project") or snapshot.get("worldBookState", {}).get("project") or {}
    title = str(project.get("title") or "Imported Snapshot")
    stamp = str(snapshot.get("exportedAt") or now_iso())[:19].replace(":", "-")
    return f"{title} — {stamp}"


def import_payload(payload: dict, mode: str = "archive") -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Imported JSON must contain an object.")

    clean_mode = str(mode or "archive").strip().lower()

    # v0.1 virtual-only state migration
    if "root" in payload and isinstance(payload.get("root"), dict):
        create_state_rollback("before-v01-json-import")
        with LOCK:
            STATE["virtualRoot"] = payload["root"]
            STATE["selectedVirtualId"] = payload.get("selectedId") or payload["root"].get("id") or "root"
            old_project = payload.get("project")
            if isinstance(old_project, dict) and old_project.get("title"):
                STATE["project"]["title"] = str(old_project["title"])
            normalize_loaded_state(STATE)
            save_state()
        return {
            "importType": "v0.1-migration",
            "message": "The legacy virtual World Book was restored into the active project.",
        }

    # Automatic rollback files can be restored through the normal Import JSON flow.
    if payload.get("format") == "eve-os-world-book-state-rollback" and isinstance(payload.get("state"), dict):
        create_state_rollback("before-rollback-json-import")
        restore_active_state(payload["state"], preserve_imports=True)
        return {
            "importType": "rollback-restore",
            "message": "Active state restored from a rollback file. A new rollback was saved first.",
        }

    # State-only imports are explicit restores, as they have no archive tree.
    if "virtualRoot" in payload and "fileMeta" in payload and "worldBookState" not in payload:
        create_state_rollback("before-state-json-import")
        restore_active_state(payload, preserve_imports=True)
        return {
            "importType": "state-restore",
            "message": "World Book state restored. A rollback copy was saved first.",
        }

    if "physicalSnapshot" in payload and "worldBookState" in payload:
        if clean_mode in {"restore-worldbook", "restore-state"}:
            create_state_rollback(f"before-json-{clean_mode}")
            incoming = payload.get("worldBookState") or {}
            if clean_mode == "restore-worldbook":
                restore_worldbook_only(incoming)
                message = "Active World Book restored from JSON. Live-file metadata was kept."
            else:
                restore_active_state(incoming, preserve_imports=True)
                message = "Complete app state restored from JSON. A rollback copy was saved first."
            return {"importType": clean_mode, "message": message}

        IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
        import_id = new_id("snapshot")
        import_path = IMPORTS_DIR / f"{import_id}.json"
        atomic_write_json(import_path, payload)
        record = {
            "id": import_id,
            "name": normalize_import_name(payload),
            "importedAt": now_iso(),
            "sourceRootPath": (payload.get("workspace") or {}).get("rootPathAtExport", ""),
            "entryCount": len((payload.get("physicalSnapshot") or {}).get("entries") or []),
        }
        with LOCK:
            STATE["imports"] = [item for item in STATE.get("imports", []) if item.get("id") != import_id]
            STATE["imports"].append(record)
            save_state()
        return {
            "importType": "snapshot",
            "record": record,
            "message": "Snapshot archived under Imports without changing the active World Book.",
        }

    raise ValueError("Unrecognized World Book JSON format.")
