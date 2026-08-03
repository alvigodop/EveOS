# Full recovery backup creation ---------------------------------------------

def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_archive_relative(path: str) -> str:
    value = str(path or "").replace("\\", "/").lstrip("/")
    parts = [part for part in value.split("/") if part not in {"", "."}]
    if any(part == ".." for part in parts):
        raise ValueError("Backup contains an unsafe path.")
    return "/".join(parts)


def recovery_workspace_entries(root: Path) -> tuple[list[dict], list[dict], list[str]]:
    files = []
    directories = []
    skipped = []
    excluded_names = {"recovery_temp", "recovery_uploads", "recovery_rollbacks", "__pycache__"}
    for current, folder_names, file_names in os.walk(root):
        current_path = Path(current)
        folder_names[:] = [name for name in folder_names if name not in excluded_names]
        folder_names.sort(key=str.casefold)
        file_names.sort(key=str.casefold)
        rel_dir = current_path.relative_to(root).as_posix()
        if rel_dir != ".":
            try:
                stat = current_path.stat()
                directories.append({
                    "path": rel_dir,
                    "mtimeNs": stat.st_mtime_ns,
                    "mode": stat.st_mode,
                })
            except OSError as exc:
                skipped.append(f"{rel_dir}: {exc}")
        for name in file_names:
            path = current_path / name
            rel = path.relative_to(root).as_posix()
            try:
                stat = path.stat()
                files.append({
                    "path": rel,
                    "size": stat.st_size,
                    "sha256": sha256_file(path),
                    "mtimeNs": stat.st_mtime_ns,
                    "mode": stat.st_mode,
                })
            except (OSError, PermissionError) as exc:
                skipped.append(f"{rel}: {exc}")
    return files, directories, skipped


def write_recovery_readme() -> str:
    return """EVE OS WORLD BOOK — FULL RECOVERY BACKUP

This archive contains the active World Book state, exact physical workspace files,
imported snapshot records, a portable JSON snapshot, and a SHA-256 manifest.

Restore through World Book's Backup & Restore panel. Physical files restore
into a chosen folder. Existing files are never overwritten unless you explicitly
select the overwrite policy. The app creates a state rollback before replacing
active World Book data.
"""


def create_full_recovery_backup() -> tuple[Path, str, dict]:
    root = configured_root()
    with LOCK:
        state_copy = json.loads(json.dumps(STATE))
        config_copy = json.loads(json.dumps(CONFIG))
    normalize_loaded_state(state_copy)
    portable = build_snapshot()
    workspace_files, workspace_dirs, skipped = recovery_workspace_entries(root)

    prefix = "eve-world-book-recovery"
    readme_bytes = write_recovery_readme().encode("utf-8")
    state_bytes = json.dumps(state_copy, indent=2, ensure_ascii=False).encode("utf-8")
    config_bytes = json.dumps(config_copy, indent=2, ensure_ascii=False).encode("utf-8")
    portable_bytes = json.dumps(portable, indent=2, ensure_ascii=False).encode("utf-8")
    payloads = [
        {"path": "README-RESTORE.txt", "size": len(readme_bytes), "sha256": sha256_bytes(readme_bytes)},
        {"path": "state/state.json", "size": len(state_bytes), "sha256": sha256_bytes(state_bytes)},
        {"path": "state/config.json", "size": len(config_bytes), "sha256": sha256_bytes(config_bytes)},
        {"path": "snapshot/portable-snapshot.json", "size": len(portable_bytes), "sha256": sha256_bytes(portable_bytes)},
    ]

    imported_files = []
    if IMPORTS_DIR.exists():
        for path in sorted(IMPORTS_DIR.glob("*.json"), key=lambda item: item.name.casefold()):
            try:
                stat = path.stat()
                imported_files.append({
                    "name": path.name,
                    "path": f"data/imports/{path.name}",
                    "size": stat.st_size,
                    "sha256": sha256_file(path),
                })
            except OSError as exc:
                skipped.append(f"data/imports/{path.name}: {exc}")

    manifest = {
        "format": RECOVERY_FORMAT,
        "formatVersion": RECOVERY_FORMAT_VERSION,
        "schemaVersion": SCHEMA_VERSION,
        "appVersion": APP_VERSION,
        "createdAt": now_iso(),
        "project": state_copy.get("project", {}),
        "originalWorkspacePath": str(root),
        "payloads": payloads,
        "workspace": {
            "fileCount": len(workspace_files),
            "directoryCount": len(workspace_dirs),
            "totalBytes": sum(item["size"] for item in workspace_files),
            "files": workspace_files,
            "directories": workspace_dirs,
        },
        "imports": {"fileCount": len(imported_files), "files": imported_files},
        "skipped": skipped,
    }

    RECOVERY_TEMP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M%S")
    title = str(state_copy.get("project", {}).get("title") or "Eve-OS-World-Book")
    safe_title = re.sub(r"[^A-Za-z0-9_-]+", "-", title).strip("-") or "Eve-OS-World-Book"
    filename = f"{safe_title}-Full-Recovery-{stamp}.zip"
    output = RECOVERY_TEMP_DIR / f"{new_id('backup')}.zip"

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        archive.writestr(f"{prefix}/README-RESTORE.txt", readme_bytes)
        archive.writestr(f"{prefix}/manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))
        archive.writestr(f"{prefix}/state/state.json", state_bytes)
        archive.writestr(f"{prefix}/state/config.json", config_bytes)
        archive.writestr(f"{prefix}/snapshot/portable-snapshot.json", portable_bytes)
        for directory in workspace_dirs:
            archive.writestr(f"{prefix}/workspace/{directory['path'].rstrip('/')}/", b"")
        for record in workspace_files:
            archive.write(root / record["path"], f"{prefix}/workspace/{record['path']}")
        for record in imported_files:
            archive.write(IMPORTS_DIR / record["name"], f"{prefix}/{record['path']}")

    verification = inspect_recovery_backup(output, verify_hashes=True)
    if not verification["integrityOk"]:
        output.unlink(missing_ok=True)
        raise ValueError("Generated recovery backup failed its own integrity check.")

    summary = {
        "fileCount": len(workspace_files),
        "directoryCount": len(workspace_dirs),
        "totalBytes": manifest["workspace"]["totalBytes"],
        "verifiedFiles": verification["verifiedFiles"],
        "skippedCount": len(skipped),
        "complete": not skipped,
    }
    return output, filename, summary
