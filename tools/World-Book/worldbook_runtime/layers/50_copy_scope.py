def status_display_name(identifier: str) -> str:
    clean = str(identifier or "draft")
    for definition in STATE.get("statusDefinitions", []):
        if str(definition.get("id") or "") == clean:
            return str(definition.get("name") or title_from_identifier(clean))
    return title_from_identifier(clean)


def tree_connectors(style: str) -> tuple[str, str, str, str]:
    if style == "ascii":
        return "|-- ", "`-- ", "|   ", "    "
    return "├── ", "└── ", "│   ", "    "


def render_scope_tree(node: dict, style: str) -> str:
    branch, last_branch, vertical, blank = tree_connectors(style)
    root_label = str(node.get("name") or "Scope")
    if node.get("kind") == "folder":
        root_label += "/"
    lines = [root_label]

    def visit(current: dict, prefix: str) -> None:
        children = current.get("children") or []
        for index, child in enumerate(children):
            is_last = index == len(children) - 1
            connector = last_branch if is_last else branch
            label = str(child.get("name") or "Untitled")
            if child.get("kind") == "folder":
                label += "/"
            lines.append(f"{prefix}{connector}{label}")
            if child.get("kind") == "folder":
                visit(child, prefix + (blank if is_last else vertical))

    if node.get("kind") == "folder":
        visit(node, "")
    return "\n".join(lines)


def physical_scope_node(
    path: Path,
    relative: str,
    include_files: bool,
    include_details: bool,
    counters: dict,
) -> dict | None:
    kind = "folder" if path.is_dir() else "file"
    if kind == "file" and not include_files:
        return None

    counters["entries"] += 1
    if counters["entries"] > MAX_COPY_SCOPE_ENTRIES:
        raise ValueError(
            f"Copy scope exceeded {MAX_COPY_SCOPE_ENTRIES:,} entries. "
            "Choose a smaller branch."
        )

    try:
        info = entry_info(path, relative)
    except OSError as exc:
        return {
            "name": path.name,
            "kind": kind,
            "children": [],
            "record": {
                "path": relative or path.name,
                "kind": kind,
                "error": str(exc),
            },
        }

    metadata = STATE.get("fileMeta", {}).get(relative, {})
    status_id = str(metadata.get("status") or "draft")
    record = {
        "path": relative or path.name,
        "kind": kind,
        "statusId": status_id,
        "statusName": status_display_name(status_id),
        "tags": normalize_tags(metadata.get("tags")),
        "manualTags": normalize_tags(metadata.get("tags")),
        "sharedTags": normalize_tags(metadata.get("sharedTags")),
        "visibleTags": normalize_tags(metadata.get("visibleTags")),
        "notes": str(metadata.get("notes") or ""),
        "links": virtual_link_details(metadata.get("links")),
        "modifiedAt": info.get("modifiedAt") or "",
        "metadataUpdatedAt": metadata.get("updatedAt") or "",
        "size": info.get("size"),
        "readable": bool(info.get("readable")),
        "editable": bool(info.get("editable")),
    }

    node = {
        "name": path.name,
        "kind": kind,
        "children": [],
        "record": record,
    }

    if kind == "folder":
        try:
            children = sorted(path.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
        except (PermissionError, OSError) as exc:
            record["error"] = str(exc)
            return node

        root = configured_root()
        for child in children:
            try:
                child_relative = child.relative_to(root).as_posix()
                child_node = physical_scope_node(
                    child,
                    child_relative,
                    include_files,
                    include_details,
                    counters,
                )
                if child_node is not None:
                    node["children"].append(child_node)
            except (PermissionError, OSError) as exc:
                counters["skipped"].append({"path": str(child), "reason": str(exc)})
        return node

    if include_details:
        if is_readable(path):
            try:
                content, _editable, format_name = read_supported_file(path)
                counters["contentChars"] += len(content)
                if counters["contentChars"] > MAX_COPY_SCOPE_CHARS:
                    raise ValueError(
                        f"Readable content exceeded {MAX_COPY_SCOPE_CHARS:,} characters. "
                        "Choose a smaller branch or use the tree-only mode."
                    )
                record["content"] = content
                record["contentFormat"] = format_name
            except Exception as exc:
                record["contentError"] = str(exc)
        else:
            record["contentError"] = "Binary or unsupported file; content omitted."

    return node


def virtual_scope_node(
    node: dict,
    path_parts: list[str],
    include_files: bool,
    include_details: bool,
    counters: dict,
) -> dict | None:
    kind = "folder" if node.get("type") == "folder" else "file"
    if kind == "file" and not include_files:
        return None

    counters["entries"] += 1
    if counters["entries"] > MAX_COPY_SCOPE_ENTRIES:
        raise ValueError(
            f"Copy scope exceeded {MAX_COPY_SCOPE_ENTRIES:,} entries. "
            "Choose a smaller branch."
        )

    name = str(node.get("name") or "Untitled")
    current_parts = [*path_parts, name]
    status_id = str(node.get("status") or "draft")
    content = str(node.get("content") or "")

    record = {
        "path": " / ".join(current_parts),
        "kind": kind,
        "statusId": status_id,
        "statusName": status_display_name(status_id),
        "tags": virtual_effective_tags(str(node.get("id") or "")),
        "manualTags": normalize_tags(node.get("tags")),
        "sharedTags": normalize_tags(node.get("sharedTags")),
        "visibleTags": normalize_tags(node.get("visibleTags")),
        "tagDetails": virtual_effective_tag_details(str(node.get("id") or "")),
        "createdAt": node.get("createdAt") or "",
        "updatedAt": node.get("updatedAt") or "",
        "sourcePath": node.get("sourcePath") or "",
        "semanticKind": node.get("semanticKind") or "",
        "nodeRole": node.get("nodeRole") or "canonical",
        "provenance": node.get("provenance") if isinstance(node.get("provenance"), dict) else {},
        "links": virtual_link_details(node.get("links")),
    }

    if include_details:
        counters["contentChars"] += len(content)
        if counters["contentChars"] > MAX_COPY_SCOPE_CHARS:
            raise ValueError(
                f"World Book content exceeded {MAX_COPY_SCOPE_CHARS:,} characters. "
                "Choose a smaller branch or use the tree-only mode."
            )
        if kind == "folder":
            record["notes"] = content
        else:
            record["content"] = content
            record["contentFormat"] = node.get("importFormat") or "virtual text"

    result = {
        "name": name,
        "kind": kind,
        "children": [],
        "record": record,
    }

    if kind == "folder":
        for child in node.get("children") or []:
            child_result = virtual_scope_node(
                child,
                current_parts,
                include_files,
                include_details,
                counters,
            )
            if child_result is not None:
                result["children"].append(child_result)

    return result


def flatten_scope_records(node: dict) -> list[dict]:
    records = [node.get("record") or {}]
    for child in node.get("children") or []:
        records.extend(flatten_scope_records(child))
    return records


def format_scope_record(record: dict, source: str) -> str:
    lines = ["=" * 88]
    lines.append(f"Path: {record.get('path') or '—'}")
    lines.append(f"Type: {str(record.get('kind') or 'entry').title()}")

    if record.get("error"):
        lines.append(f"Error: {record['error']}")
        return "\n".join(lines)

    lines.append(
        f"Status: {record.get('statusName') or 'Draft'} "
        f"[{record.get('statusId') or 'draft'}]"
    )
    tags = record.get("tags") or []
    lines.append(f"Tags (effective): {', '.join(tags) if tags else '—'}")
    manual_tags = record.get("manualTags") or []
    if manual_tags != tags or record.get("sharedTags") or record.get("visibleTags"):
        lines.append(f"Manual tags: {', '.join(manual_tags) if manual_tags else '—'}")
        shared_tags = record.get("sharedTags") or []
        lines.append(f"Shared to descendants: {', '.join(shared_tags) if shared_tags else '—'}")
        visible_tags = record.get("visibleTags") or []
        lines.append(f"Shown beside status: {', '.join(visible_tags) if visible_tags else '—'}")

    if source == "physical":
        lines.append(f"Filesystem modified: {record.get('modifiedAt') or '—'}")
        lines.append(f"Metadata updated: {record.get('metadataUpdatedAt') or '—'}")
        size = record.get("size")
        lines.append(f"Size: {size:,} bytes" if isinstance(size, int) else "Size: —")
    else:
        lines.append(f"Created: {record.get('createdAt') or '—'}")
        lines.append(f"Last edited: {record.get('updatedAt') or '—'}")
        if record.get("sourcePath"):
            lines.append(f"Original source path: {record['sourcePath']}")
        if record.get("semanticKind"):
            lines.append(f"Semantic kind: {record['semanticKind']}")
        if record.get("nodeRole"):
            lines.append(f"Tree role: {record['nodeRole']}")
        provenance = record.get("provenance") or {}
        if provenance:
            lines.append("Provenance:")
            if provenance.get("source"): lines.append(f"  - Source: {provenance['source']}")
            if provenance.get("knownAsOf"): lines.append(f"  - Known as of: {provenance['knownAsOf']}")
            if provenance.get("confidence"): lines.append(f"  - Confidence: {provenance['confidence']}")
            if provenance.get("createdBy"): lines.append(f"  - Created by: {provenance['createdBy']}")

    links = record.get("links") or []
    if links:
        lines.append("Links:")
        for link in links:
            label = link.get("displayLabel") or "Link"
            target = link.get("targetPath") or "[missing target]"
            relation = link.get("relationshipType") or "related-to"
            lines.append(f"  - {label} [{relation}] -> {target}")
            link_provenance = link.get("provenance") or {}
            if link_provenance.get("source") or link_provenance.get("knownAsOf"):
                source_text = link_provenance.get("source") or "source unspecified"
                known_text = link_provenance.get("knownAsOf") or "time unspecified"
                lines.append(f"    Provenance: {source_text} · known as of {known_text}")

    notes = str(record.get("notes") or "")
    if notes:
        lines.extend(["", "Connected notes:", notes])

    if "content" in record:
        lines.extend([
            "",
            f"Content ({record.get('contentFormat') or 'text'}):",
            str(record.get("content") or ""),
        ])
    elif record.get("contentError"):
        lines.extend(["", f"Content: [{record['contentError']}]"])

    return "\n".join(lines)


def build_copy_scope(
    source: str,
    mode: str,
    style: str,
    physical_path: str = "",
    virtual_id: str = "root",
) -> dict:
    if mode not in {"folders", "tree", "full"}:
        raise ValueError("Copy mode must be folders, tree, or full.")
    if style not in {"unicode", "ascii"}:
        raise ValueError("Tree style must be unicode or ascii.")

    include_files = mode != "folders"
    include_details = mode == "full"
    counters = {"entries": 0, "contentChars": 0, "skipped": []}

    if source == "physical":
        target, normalized = resolve_relative(physical_path)
        if mode == "folders" and target.is_file():
            raise ValueError("Folder-tree mode requires a folder selection.")
        scope_node = physical_scope_node(
            target,
            normalized,
            include_files,
            include_details,
            counters,
        )
        source_label = "Live Files"
        scope_label = str(target)
    elif source == "virtual":
        with LOCK:
            selected = find_virtual_node(STATE.get("virtualRoot", {}), virtual_id)
            if selected is None:
                raise FileNotFoundError("The selected World Book entry was not found.")
            if mode == "folders" and selected.get("type") != "folder":
                raise ValueError("Folder-tree mode requires a folder selection.")
            selected_copy = json.loads(json.dumps(selected))
        scope_node = virtual_scope_node(
            selected_copy,
            [],
            include_files,
            include_details,
            counters,
        )
        source_label = "World Book"
        scope_label = " / ".join(
            str(item.get("name") or "Untitled")
            for item in virtual_path_records(virtual_id)
        )
    else:
        raise ValueError("Copy source must be physical or virtual.")

    if scope_node is None:
        raise ValueError("The selected scope produced no entries.")

    mode_label = {
        "folders": "Folders and subfolders only",
        "tree": "Folders and files",
        "full": "Folders, files, contents, tags, statuses, and edit times",
    }[mode]

    sections = [
        "EVE OS WORLD BOOK — COPY SCOPE",
        f"Source: {source_label}",
        f"Scope: {scope_label}",
        f"Mode: {mode_label}",
        f"Generated: {now_iso()}",
        "",
        "TREE",
        "----",
        render_scope_tree(scope_node, style),
    ]

    if include_details:
        sections.extend(["", "ENTRY DETAILS", "-------------"])
        for record in flatten_scope_records(scope_node):
            sections.extend(["", format_scope_record(record, source)])

    if counters["skipped"]:
        sections.extend(["", "SKIPPED", "-------"])
        for item in counters["skipped"]:
            sections.append(f"{item['path']}: {item['reason']}")

    output = "\n".join(sections).rstrip() + "\n"
    if len(output) > MAX_COPY_SCOPE_CHARS * 2:
        raise ValueError("The generated copy is too large. Choose a smaller branch.")

    safe_scope = safe_zip_component(str(scope_node.get("name") or "scope"))
    return {
        "text": output,
        "filename": f"{safe_scope}-{mode}.txt",
        "entryCount": counters["entries"],
        "contentCharacterCount": counters["contentChars"],
        "skippedCount": len(counters["skipped"]),
        "source": source,
        "mode": mode,
    }
