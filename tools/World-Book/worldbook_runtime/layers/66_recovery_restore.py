# Full recovery inspection and restore -------------------------------------

def recovery_member(prefix: str, suffix: str) -> str:
    return f"{prefix.rstrip('/')}/{suffix.lstrip('/')}"


def inspect_recovery_backup(path: Path, verify_hashes: bool = True) -> dict:
    if not path.is_file():
        raise FileNotFoundError("Recovery backup upload was not found.")
    with zipfile.ZipFile(path, "r") as archive:
        names = archive.namelist()
        candidates = []
        for name in names:
            if not name.endswith("/manifest.json"):
                continue
            try:
                candidate = json.loads(archive.read(name).decode("utf-8"))
            except (ValueError, UnicodeDecodeError, KeyError):
                continue
            if isinstance(candidate, dict) and candidate.get("format") == RECOVERY_FORMAT:
                candidates.append((name, candidate))
        if len(candidates) != 1:
            raise ValueError("This ZIP does not contain exactly one valid Eve OS recovery manifest.")
        manifest_name, manifest = candidates[0]
        prefix = manifest_name[:-len("/manifest.json")]
        if int(manifest.get("formatVersion") or 0) > RECOVERY_FORMAT_VERSION:
            raise ValueError("This backup was created by a newer unsupported recovery format.")

        expected_state = recovery_member(prefix, "state/state.json")
        if expected_state not in names:
            raise ValueError("Recovery backup is missing its state file.")

        verified = 0
        failures = []

        def verify_record(member: str, record: dict, label: str) -> None:
            nonlocal verified
            if member not in names:
                failures.append(f"Missing: {label}")
                return
            info = archive.getinfo(member)
            if info.file_size != int(record.get("size") or 0):
                failures.append(f"Size mismatch: {label}")
                return
            if verify_hashes:
                digest = hashlib.sha256()
                with archive.open(member, "r") as handle:
                    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                        digest.update(chunk)
                if digest.hexdigest() != str(record.get("sha256") or ""):
                    failures.append(f"Hash mismatch: {label}")
                    return
            verified += 1

        for record in manifest.get("payloads") or []:
            rel = safe_archive_relative(record.get("path"))
            verify_record(recovery_member(prefix, rel), record, rel)

        for record in (manifest.get("workspace") or {}).get("files") or []:
            rel = safe_archive_relative(record.get("path"))
            verify_record(recovery_member(prefix, f"workspace/{rel}"), record, f"workspace/{rel}")

        for record in (manifest.get("imports") or {}).get("files") or []:
            rel = safe_archive_relative(record.get("path") or f"data/imports/{record.get('name')}")
            verify_record(recovery_member(prefix, rel), record, rel)

        for record in (manifest.get("narrationDocuments") or {}).get("files") or []:
            rel = safe_archive_relative(record.get("path"))
            verify_record(recovery_member(prefix, rel), record, rel)

    return {
        "manifest": manifest,
        "prefix": prefix,
        "verifiedFiles": verified,
        "integrityOk": not failures,
        "failures": failures[:100],
    }


def store_recovery_upload(handler) -> dict:
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length <= 0:
        raise ValueError("Choose a recovery ZIP to inspect.")
    if length > MAX_RECOVERY_UPLOAD_BYTES:
        raise ValueError("Recovery ZIP exceeds the configured upload limit.")
    RECOVERY_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    upload_id = new_id("recovery")
    path = RECOVERY_UPLOADS_DIR / f"{upload_id}.zip"
    remaining = length
    with path.open("wb") as handle:
        while remaining:
            chunk = handler.rfile.read(min(1024 * 1024, remaining))
            if not chunk:
                raise ValueError("Recovery upload ended unexpectedly.")
            handle.write(chunk)
            remaining -= len(chunk)
    try:
        inspection = inspect_recovery_backup(path, verify_hashes=True)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    manifest = inspection["manifest"]
    return {
        "uploadId": upload_id,
        "inspection": {
            "integrityOk": inspection["integrityOk"],
            "verifiedFiles": inspection["verifiedFiles"],
            "failures": inspection["failures"],
            "createdAt": manifest.get("createdAt"),
            "appVersion": manifest.get("appVersion"),
            "schemaVersion": manifest.get("schemaVersion"),
            "project": manifest.get("project") or {},
            "originalWorkspacePath": manifest.get("originalWorkspacePath") or "",
            "workspace": manifest.get("workspace") or {},
            "imports": manifest.get("imports") or {},
            "narrationDocuments": manifest.get("narrationDocuments") or {},
            "skipped": manifest.get("skipped") or [],
        },
    }


def default_recovery_destination(original: str) -> str:
    value = str(original or "").rstrip("\\/")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"{value}-Recovered-{stamp}" if value else str(Path.home() / f"Eve-WorldBook-Recovered-{stamp}")


def restore_workspace_from_archive(archive, prefix: str, manifest: dict, destination: Path, policy: str) -> dict:
    policy = str(policy or "new-folder")
    if policy == "new-folder" and destination.exists() and any(destination.iterdir()):
        raise FileExistsError("The safe restore destination must be new or empty.")
    destination.mkdir(parents=True, exist_ok=True)
    written = 0
    skipped = 0
    verified = 0

    for record in (manifest.get("workspace") or {}).get("directories") or []:
        rel = safe_archive_relative(record.get("path"))
        folder = destination / Path(rel)
        if folder.exists() and not folder.is_dir():
            if policy == "skip-existing":
                continue
            if policy == "new-folder":
                raise FileExistsError(f"Restore folder conflicts with a file: {rel}")
            folder.unlink()
        folder.mkdir(parents=True, exist_ok=True)

    for record in (manifest.get("workspace") or {}).get("files") or []:
        rel = safe_archive_relative(record.get("path"))
        target = (destination / Path(rel)).resolve()
        if Path(os.path.commonpath([str(destination.resolve()), str(target)])) != destination.resolve():
            raise PermissionError("Recovery path escaped the selected destination.")
        if target.exists() and policy == "skip-existing":
            skipped += 1
            continue
        if target.exists() and policy == "new-folder":
            raise FileExistsError(f"Restore target already exists: {rel}")
        target.parent.mkdir(parents=True, exist_ok=True)
        member = recovery_member(prefix, f"workspace/{rel}")
        temp = target.with_name(target.name + ".eve-restore-tmp")
        digest = hashlib.sha256()
        with archive.open(member, "r") as source, temp.open("wb") as output:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                output.write(chunk)
                digest.update(chunk)
        if digest.hexdigest() != str(record.get("sha256") or ""):
            temp.unlink(missing_ok=True)
            raise ValueError(f"Restored file failed integrity verification: {rel}")
        if target.exists():
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
        temp.replace(target)
        mtime_ns = int(record.get("mtimeNs") or 0)
        if mtime_ns:
            os.utime(target, ns=(mtime_ns, mtime_ns))
        written += 1
        verified += 1
    return {"writtenFiles": written, "skippedFiles": skipped, "verifiedFiles": verified}


def restore_import_files(archive, prefix: str, manifest: dict) -> int:
    IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
    restored = 0
    for record in (manifest.get("imports") or {}).get("files") or []:
        name = Path(str(record.get("name") or "")).name
        if not name:
            continue
        member = recovery_member(prefix, f"data/imports/{name}")
        target = IMPORTS_DIR / name
        with archive.open(member, "r") as source, target.open("wb") as output:
            shutil.copyfileobj(source, output, 1024 * 1024)
        if sha256_file(target) != str(record.get("sha256") or ""):
            target.unlink(missing_ok=True)
            raise ValueError(f"Imported snapshot failed verification: {name}")
        restored += 1
    return restored


def archive_current_narration_documents() -> str:
    if not NARRATION_DOCUMENTS_DIR.exists() or not any(NARRATION_DOCUMENTS_DIR.rglob("*")):
        return ""
    RECOVERY_ROLLBACKS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output = RECOVERY_ROLLBACKS_DIR / f"narration-before-restore-{stamp}.zip"
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in NARRATION_DOCUMENTS_DIR.rglob("*"):
            if path.is_file():
                archive.write(path, path.relative_to(NARRATION_DOCUMENTS_DIR).as_posix())
    return str(output)


def restore_narration_documents(archive, prefix: str, manifest: dict) -> tuple[int, str]:
    records = (manifest.get("narrationDocuments") or {}).get("files") or []
    if not records:
        return 0, ""
    staging = RECOVERY_TEMP_DIR / new_id("narration-restore")
    staging.mkdir(parents=True, exist_ok=False)
    restored = 0
    try:
        for record in records:
            relative = safe_archive_relative(record.get("relativePath"))
            target = (staging / Path(relative)).resolve()
            if Path(os.path.commonpath([str(staging.resolve()), str(target)])) != staging.resolve():
                raise PermissionError("Narration recovery path escaped its staging directory.")
            target.parent.mkdir(parents=True, exist_ok=True)
            member_path = safe_archive_relative(record.get("path"))
            with archive.open(recovery_member(prefix, member_path), "r") as source, target.open("wb") as output:
                shutil.copyfileobj(source, output, 1024 * 1024)
            if sha256_file(target) != str(record.get("sha256") or ""):
                raise ValueError(f"Reader document failed verification: {relative}")
            restored += 1
        rollback = archive_current_narration_documents()
        if NARRATION_DOCUMENTS_DIR.exists():
            shutil.rmtree(NARRATION_DOCUMENTS_DIR)
        staging.replace(NARRATION_DOCUMENTS_DIR)
        return restored, rollback
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def restore_recovery_backup(upload_id: str, mode: str, destination_path: str, policy: str) -> dict:
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", str(upload_id or ""))
    path = RECOVERY_UPLOADS_DIR / f"{safe_id}.zip"
    inspection = inspect_recovery_backup(path, verify_hashes=True)
    if not inspection["integrityOk"]:
        raise ValueError("Recovery backup failed integrity verification.")
    manifest = inspection["manifest"]
    prefix = inspection["prefix"]
    clean_mode = str(mode or "everything")
    restore_state = clean_mode in {"worldbook", "everything"}
    restore_physical = clean_mode in {"physical", "everything"}
    rollback = None
    destination = None
    physical_result = None
    imported_count = 0
    narration_count = 0
    narration_rollback = ""

    with zipfile.ZipFile(path, "r") as archive:
        if restore_state:
            rollback = create_state_rollback("before-full-recovery-restore")
            incoming = json.loads(archive.read(recovery_member(prefix, "state/state.json")).decode("utf-8"))
            restore_active_state(incoming, preserve_imports=False)
            imported_count = restore_import_files(archive, prefix, manifest)
            narration_count, narration_rollback = restore_narration_documents(archive, prefix, manifest)

        if restore_physical:
            destination_value = str(destination_path or "").strip() or default_recovery_destination(manifest.get("originalWorkspacePath"))
            destination = Path(destination_value).expanduser().resolve()
            physical_result = restore_workspace_from_archive(archive, prefix, manifest, destination, policy)
            if clean_mode == "everything":
                with LOCK:
                    CONFIG["rootPath"] = str(destination)
                    save_config()

    path.unlink(missing_ok=True)
    return {
        "mode": clean_mode,
        "rollback": rollback,
        "destinationPath": str(destination) if destination else "",
        "physical": physical_result,
        "restoredImportFiles": imported_count,
        "restoredNarrationFiles": narration_count,
        "narrationRollback": narration_rollback,
        "message": "Full recovery restore completed and verified.",
    }



def cleanup_recovery_staging(max_upload_age_days: int = 7, max_rollbacks: int = 30) -> None:
    cutoff = time.time() - max_upload_age_days * 86400
    for directory in (RECOVERY_UPLOADS_DIR, RECOVERY_TEMP_DIR):
        if not directory.exists():
            continue
        for path in directory.glob("*.zip"):
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink(missing_ok=True)
            except OSError:
                pass
    if RECOVERY_ROLLBACKS_DIR.exists():
        rollbacks = sorted(
            RECOVERY_ROLLBACKS_DIR.glob("rollback-*.json"),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        )
        for path in rollbacks[max_rollbacks:]:
            path.unlink(missing_ok=True)
