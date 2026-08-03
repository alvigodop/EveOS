def sys_platform() -> str:
    import sys
    return sys.platform




def find_virtual_node(node: dict, node_id: str) -> dict | None:
    if node.get("id") == node_id:
        return node
    if node.get("type") == "folder":
        for child in node.get("children", []):
            found = find_virtual_node(child, node_id)
            if found is not None:
                return found
    return None


def unique_virtual_name(parent: dict, desired_name: str) -> str:
    existing = {str(child.get("name") or "").lower() for child in parent.get("children", [])}
    if desired_name.lower() not in existing:
        return desired_name

    stem = desired_name
    suffix = 2
    while f"{stem} (Imported {suffix})".lower() in existing:
        suffix += 1
    return f"{stem} (Imported {suffix})"


def safe_zip_component(name: str) -> str:
    cleaned = "".join("_" if char in '<>:"/\\|?*' or ord(char) < 32 else char for char in str(name))
    cleaned = cleaned.rstrip(" .") or "Untitled"
    reserved = {
        "CON", "PRN", "AUX", "NUL",
        *(f"COM{number}" for number in range(1, 10)),
        *(f"LPT{number}" for number in range(1, 10)),
    }
    stem = cleaned.split(".", 1)[0].upper()
    if stem in reserved:
        cleaned = f"_{cleaned}"
    return cleaned


def physical_entry_to_virtual(path: Path, relative: str, counters: dict) -> dict:
    counters["entries"] += 1
    if counters["entries"] > MAX_TRANSFER_ENTRIES:
        raise ValueError(
            f"Transfer stopped because it exceeded {MAX_TRANSFER_ENTRIES:,} entries. "
            "Copy a smaller branch."
        )

    metadata = STATE.get("fileMeta", {}).get(relative, {})
    status = str(metadata.get("status") or "draft")
    tags = list(metadata.get("tags") or [])
    if "imported-from-live" not in tags:
        tags.append("imported-from-live")
    ensure_tag_definition(STATE, "imported-from-live")

    node = default_virtual_node("folder" if path.is_dir() else "file", path.name, status)
    node["tags"] = tags
    node["sharedTags"] = normalize_tags(metadata.get("sharedTags")) if path.is_dir() else []
    node["visibleTags"] = normalize_tags(metadata.get("visibleTags") if "visibleTags" in metadata else tags)
    if "imported-from-live" not in {tag.casefold() for tag in node["visibleTags"]}:
        node["visibleTags"].append("imported-from-live")
    node["links"] = normalize_link_list(metadata.get("links"))
    node["sourcePath"] = relative
    node["sourceKind"] = "physical"

    connected_notes = str(metadata.get("notes") or "").strip()

    if path.is_dir():
        node["content"] = connected_notes
        children = []
        for child in sorted(path.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower())):
            try:
                child_relative = child.relative_to(configured_root()).as_posix()
                children.append(physical_entry_to_virtual(child, child_relative, counters))
            except (PermissionError, OSError) as exc:
                skipped = default_virtual_node("file", f"{child.name} [Skipped]", "recovered")
                skipped["tags"] = ["imported-from-live", "transfer-skipped"]
                skipped["content"] = f"Source: {relative}\nReason: {exc}"
                children.append(skipped)
        node["children"] = children
        return node

    content = ""
    if is_readable(path):
        try:
            content, _editable, format_name = read_supported_file(path)
            counters["chars"] += len(content)
            if counters["chars"] > MAX_TRANSFER_CHARS:
                raise ValueError(
                    f"Transfer stopped because readable content exceeded "
                    f"{MAX_TRANSFER_CHARS:,} characters. Copy a smaller branch."
                )
            node["importFormat"] = format_name
        except Exception as exc:
            content = f"[Content could not be imported]\nSource: {relative}\nReason: {exc}"
            node["status"] = "recovered"
    else:
        content = (
            "[Binary or unsupported physical file]\n"
            f"Source: {relative}\n"
            "The original file was not embedded. Open it from Live Files."
        )
        node["tags"].append("external-file-reference")

    if connected_notes:
        content = f"{connected_notes}\n\n--- Imported file content ---\n\n{content}" if content else connected_notes

    node["content"] = content
    return node


def copy_physical_to_worldbook(relative_path: str, destination_virtual_id: str) -> dict:
    target, normalized = resolve_relative(relative_path)
    if not target.exists():
        raise FileNotFoundError("The selected physical entry was not found.")

    with LOCK:
        destination = find_virtual_node(STATE.get("virtualRoot", {}), destination_virtual_id)
        if destination is None:
            raise FileNotFoundError("The selected World Book destination was not found.")
        if destination.get("type") != "folder":
            raise ValueError("The World Book destination must be a folder.")

        counters = {"entries": 0, "chars": 0}
        imported = physical_entry_to_virtual(target, normalized, counters)
        imported["name"] = unique_virtual_name(destination, imported["name"])
        destination.setdefault("children", []).append(imported)
        destination["open"] = True
        destination["updatedAt"] = now_iso()
        STATE["selectedVirtualId"] = imported["id"]
        STATE.setdefault("ui", {})["lastVirtualFolderId"] = destination_virtual_id
        save_state()

    return {
        "node": imported,
        "entryCount": counters["entries"],
        "characterCount": counters["chars"],
        "destinationVirtualId": destination_virtual_id,
    }


def virtual_zip_entries(node: dict, base_parts: list[str], metadata: list[dict]) -> list[tuple[str, str]]:
    safe_name = safe_zip_component(str(node.get("name") or "Untitled"))
    current_parts = [*base_parts, safe_name]
    relative = "/".join(current_parts)

    metadata.append({
        "path": relative,
        "id": node.get("id"),
        "type": node.get("type"),
        "status": node.get("status", "draft"),
        "tags": virtual_effective_tags(str(node.get("id") or "")),
        "manualTags": normalize_tags(node.get("tags")),
        "sharedTags": normalize_tags(node.get("sharedTags")),
        "visibleTags": normalize_tags(node.get("visibleTags")),
        "tagDetails": virtual_effective_tag_details(str(node.get("id") or "")),
        "notes": node.get("content", "") if node.get("type") == "folder" else "",
        "links": virtual_link_details(node.get("links")),
        "sourcePath": node.get("sourcePath", ""),
    })

    entries: list[tuple[str, str]] = []
    if node.get("type") == "folder":
        entries.append((relative.rstrip("/") + "/", ""))
        for child in node.get("children", []):
            entries.extend(virtual_zip_entries(child, current_parts, metadata))
    else:
        entries.append((relative, str(node.get("content") or "")))

    return entries


def export_virtual_to_live_zip(
    virtual_id: str,
    destination_relative_path: str,
    zip_name: str,
) -> dict:
    destination, destination_normalized = resolve_relative(destination_relative_path)
    if not destination.is_dir():
        raise NotADirectoryError("The live destination must be a folder.")

    with LOCK:
        node = find_virtual_node(STATE.get("virtualRoot", {}), virtual_id)
        if node is None:
            raise FileNotFoundError("The selected World Book entry was not found.")
        node_copy = json.loads(json.dumps(node))

    requested_name = str(zip_name or node_copy.get("name") or "WorldBook-Export").strip()
    if not requested_name.lower().endswith(".zip"):
        requested_name += ".zip"
    requested_name = safe_zip_component(requested_name)

    target = destination / requested_name
    if target.exists():
        raise FileExistsError(f'"{requested_name}" already exists in the selected live folder.')

    metadata: list[dict] = []
    entries = virtual_zip_entries(node_copy, [], metadata)
    manifest = {
        "app": "World Book",
        "appVersion": APP_VERSION,
        "exportedAt": now_iso(),
        "selectedVirtualId": virtual_id,
        "entries": metadata,
    }

    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for archive_path, content in entries:
            if archive_path.endswith("/"):
                archive.writestr(archive_path, b"")
            else:
                archive.writestr(archive_path, content.encode("utf-8"))
        archive.writestr(
            "_EVE_WORLDBOOK_METADATA.json",
            json.dumps(manifest, indent=2, ensure_ascii=False).encode("utf-8"),
        )

    root = configured_root()
    relative = target.relative_to(root).as_posix()

    with LOCK:
        STATE.setdefault("ui", {})["lastPhysicalFolderPath"] = destination_normalized
        save_state()

    return {
        "entry": entry_info(target, relative),
        "archiveEntryCount": len(entries),
        "metadataEntryCount": len(metadata),
    }
