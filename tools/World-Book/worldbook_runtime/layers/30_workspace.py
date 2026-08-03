def configured_root() -> Path:
    raw = str(CONFIG.get("rootPath") or "").strip()
    if not raw:
        raise ValueError("No workspace path is configured.")
    root = Path(raw).expanduser()
    if not root.exists():
        raise FileNotFoundError(f"Workspace path does not exist: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"Workspace path is not a folder: {root}")
    return root.resolve()


def resolve_relative(relative_path: str | None) -> tuple[Path, str]:
    root = configured_root()
    rel = unquote(str(relative_path or "")).replace("\\", "/").strip("/")
    target = (root / rel).resolve()

    try:
        common = Path(os.path.commonpath([str(root), str(target)]))
    except ValueError as exc:
        raise PermissionError("Path is outside the configured workspace.") from exc

    if common != root:
        raise PermissionError("Path is outside the configured workspace.")

    normalized = "" if target == root else target.relative_to(root).as_posix()
    return target, normalized


def is_text_extension(path: Path) -> bool:
    return path.suffix.lower() in TEXT_EXTENSIONS or path.name.lower() in {".gitignore", ".gitattributes"}


def is_readable(path: Path) -> bool:
    return path.is_file() and (path.suffix.lower() in READABLE_EXTENSIONS or is_text_extension(path))


def read_text_file(path: Path) -> str:
    size = path.stat().st_size
    if size > MAX_SINGLE_TEXT_BYTES:
        raise ValueError(f"File is too large to preview ({size:,} bytes).")

    raw = path.read_bytes()
    encodings = ["utf-8-sig", "utf-16", "utf-16-le", "utf-16-be", "cp1252"]
    last_error = None

    for encoding in encodings:
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError as exc:
            last_error = exc

    raise ValueError("Could not decode this file as supported text.") from last_error


def extract_docx_text(path: Path) -> str:
    if path.stat().st_size > MAX_SINGLE_TEXT_BYTES * 4:
        raise ValueError("DOCX file is too large to preview.")

    try:
        with zipfile.ZipFile(path) as archive:
            xml_bytes = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile) as exc:
        raise ValueError("This DOCX file could not be read.") from exc

    root = ElementTree.fromstring(xml_bytes)
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    paragraphs = []

    for paragraph in root.iter(namespace + "p"):
        pieces = []
        for element in paragraph.iter():
            if element.tag == namespace + "t" and element.text:
                pieces.append(element.text)
            elif element.tag == namespace + "tab":
                pieces.append("\t")
            elif element.tag in {namespace + "br", namespace + "cr"}:
                pieces.append("\n")
        paragraphs.append("".join(pieces))

    return "\n".join(paragraphs)


def read_supported_file(path: Path) -> tuple[str, bool, str]:
    suffix = path.suffix.lower()

    if suffix == ".docx":
        return extract_docx_text(path), False, "docx"

    if is_text_extension(path):
        return read_text_file(path), True, "text"

    raise ValueError("This file type is not previewable yet.")


def entry_info(path: Path, relative: str) -> dict:
    stat = path.stat()
    suffix = path.suffix.lower()
    readable = is_readable(path)

    return {
        "name": path.name if relative else path.name,
        "relativePath": relative,
        "kind": "folder" if path.is_dir() else "file",
        "extension": suffix,
        "size": stat.st_size if path.is_file() else None,
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "readable": readable,
        "editable": path.is_file() and is_text_extension(path),
    }


def list_directory(relative_path: str) -> list[dict]:
    target, normalized = resolve_relative(relative_path)
    if not target.is_dir():
        raise NotADirectoryError("Selected path is not a folder.")

    entries = []
    for child in target.iterdir():
        try:
            rel = child.relative_to(configured_root()).as_posix()
            entries.append(entry_info(child, rel))
        except (PermissionError, OSError):
            continue

    entries.sort(key=lambda item: (item["kind"] != "folder", item["name"].lower()))
    return entries


def search_workspace(query: str, limit: int = 250) -> list[dict]:
    normalized_query = query.strip().lower()
    if not normalized_query:
        return []

    root = configured_root()
    results = []

    for current, folders, files in os.walk(root):
        current_path = Path(current)
        folders[:] = [name for name in folders if not name.startswith(".")]

        for name in folders + files:
            if normalized_query not in name.lower():
                continue

            path = current_path / name
            try:
                rel = path.relative_to(root).as_posix()
                results.append(entry_info(path, rel))
            except (PermissionError, OSError):
                continue

            if len(results) >= limit:
                return results

    return results


def open_external(path: Path) -> None:
    if os.name == "nt":
        os.startfile(str(path))  # type: ignore[attr-defined]
        return
    if sys_platform() == "darwin":
        subprocess.Popen(["open", str(path)])
        return
    subprocess.Popen(["xdg-open", str(path)])


def reveal_external(path: Path) -> None:
    if os.name == "nt":
        if path.is_file():
            subprocess.Popen(["explorer", f"/select,{path}"])
        else:
            subprocess.Popen(["explorer", str(path)])
        return
    if sys_platform() == "darwin":
        if path.is_file():
            subprocess.Popen(["open", "-R", str(path)])
        else:
            subprocess.Popen(["open", str(path)])
        return
    subprocess.Popen(["xdg-open", str(path.parent if path.is_file() else path)])
