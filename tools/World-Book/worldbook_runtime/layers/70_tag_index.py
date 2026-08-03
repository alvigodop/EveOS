def tagged_physical_index() -> list[dict]:
    root_value = str(CONFIG.get("rootPath") or "").strip()
    if not root_value:
        return []
    root = Path(root_value).expanduser()
    if not root.is_dir():
        return []
    root = root.resolve()

    with LOCK:
        metadata_items = json.loads(json.dumps(STATE.get("fileMeta", {})))

    results = []
    for relative, metadata in metadata_items.items():
        if not isinstance(metadata, dict):
            continue
        tags = [str(tag).strip() for tag in metadata.get("tags") or [] if str(tag).strip()]
        if not tags:
            continue

        normalized = str(relative or "").replace("\\", "/").strip("/")
        target = (root / normalized).resolve()
        try:
            common = Path(os.path.commonpath([str(root), str(target)]))
        except ValueError:
            continue
        if common != root:
            continue

        if target.exists():
            try:
                info = entry_info(target, normalized)
            except (PermissionError, OSError):
                continue
            info.update({
                "tags": tags,
                "status": str(metadata.get("status") or "draft"),
                "notes": str(metadata.get("notes") or ""),
                "metaUpdatedAt": metadata.get("updatedAt") or "",
                "missing": False,
            })
        else:
            info = {
                "name": Path(normalized).name or root.name,
                "relativePath": normalized,
                "kind": "missing",
                "extension": Path(normalized).suffix.lower(),
                "size": None,
                "modifiedAt": "",
                "readable": False,
                "editable": False,
                "tags": tags,
                "status": str(metadata.get("status") or "draft"),
                "notes": str(metadata.get("notes") or ""),
                "metaUpdatedAt": metadata.get("updatedAt") or "",
                "missing": True,
            }
        results.append(info)

    results.sort(
        key=lambda item: max(str(item.get("modifiedAt") or ""), str(item.get("metaUpdatedAt") or "")),
        reverse=True,
    )
    return results
