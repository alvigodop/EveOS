# Private reader-document storage and extraction ---------------------------

from html.parser import HTMLParser


class NarrationHTMLTextExtractor(HTMLParser):
    BLOCK_TAGS = {
        "address", "article", "aside", "blockquote", "br", "div", "footer",
        "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main",
        "nav", "p", "pre", "section", "table", "tr",
    }
    IGNORED_TAGS = {"script", "style", "svg", "template"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.ignored_depth = 0

    def handle_starttag(self, tag: str, _attrs) -> None:
        name = tag.casefold()
        if name in self.IGNORED_TAGS:
            self.ignored_depth += 1
        elif not self.ignored_depth and name in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        name = tag.casefold()
        if name in self.IGNORED_TAGS and self.ignored_depth:
            self.ignored_depth -= 1
        elif not self.ignored_depth and name in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.ignored_depth:
            self.parts.append(data)

    def text(self) -> str:
        value = "".join(self.parts).replace("\r\n", "\n").replace("\r", "\n")
        value = re.sub(r"[ \t]+", " ", value)
        value = re.sub(r" *\n *", "\n", value)
        return re.sub(r"\n{3,}", "\n\n", value).strip()


def narration_safe_id(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]", "", str(value or ""))
    if not safe or len(safe) > 80:
        raise ValueError("Reader document id is invalid.")
    return safe


def narration_document_dir(document_id: str) -> Path:
    return NARRATION_DOCUMENTS_DIR / narration_safe_id(document_id)


def decode_narration_text(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16", "utf-16-le", "utf-16-be", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not decode this document as supported text.")


def extract_narration_pdf(path: Path) -> str:
    try:
        import fitz  # type: ignore[import-not-found]
    except ImportError as exc:
        raise ValueError("PDF reading needs PyMuPDF installed in the World Book Python environment.") from exc
    try:
        with fitz.open(path) as document:
            return "\n\n".join(page.get_text("text", sort=True).strip() for page in document).strip()
    except Exception as exc:
        raise ValueError("This PDF could not be read.") from exc


def extract_narration_text(path: Path) -> tuple[str, str]:
    suffix = path.suffix.casefold()
    if suffix not in NARRATION_EXTENSIONS:
        raise ValueError("Reader documents must be PDF, DOCX, TXT, Markdown, or HTML.")
    if suffix == ".pdf":
        return extract_narration_pdf(path), "pdf"
    if suffix == ".docx":
        return extract_docx_text(path), "docx"
    raw = path.read_bytes()
    value = decode_narration_text(raw)
    if suffix in {".html", ".htm"}:
        parser = NarrationHTMLTextExtractor()
        parser.feed(value)
        return parser.text(), "html"
    return value.replace("\r\n", "\n").replace("\r", "\n").strip(), "text"


def narration_metadata(document_dir: Path) -> dict:
    path = document_dir / "meta.json"
    if not path.is_file():
        raise FileNotFoundError("Reader document metadata was not found.")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Reader document metadata is invalid.")
    return payload


def list_narration_documents() -> list[dict]:
    if not NARRATION_DOCUMENTS_DIR.exists():
        return []
    records = []
    for document_dir in NARRATION_DOCUMENTS_DIR.iterdir():
        if not document_dir.is_dir():
            continue
        try:
            record = narration_metadata(document_dir)
            record["hasSource"] = bool(record.get("sourceFile") and (document_dir / record["sourceFile"]).is_file())
            records.append(record)
        except (OSError, ValueError, json.JSONDecodeError):
            continue
    records.sort(key=lambda item: str(item.get("updatedAt") or ""), reverse=True)
    return records


def get_narration_document(document_id: str, include_text: bool = True) -> dict:
    document_dir = narration_document_dir(document_id)
    record = narration_metadata(document_dir)
    if include_text:
        text_path = document_dir / "text.txt"
        if not text_path.is_file():
            raise FileNotFoundError("Reader document text was not found.")
        record["text"] = text_path.read_text(encoding="utf-8")
    return record


def save_narration_document(title: str, text: str, source_path: Path | None = None, format_name: str = "text") -> dict:
    clean_text = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not clean_text:
        raise ValueError("The document did not contain readable text.")
    if len(clean_text) > MAX_TOTAL_SNAPSHOT_CHARS:
        raise ValueError("The extracted document is too large for the reader library.")
    document_id = new_id("reader")
    document_dir = narration_document_dir(document_id)
    document_dir.mkdir(parents=True, exist_ok=False)
    source_name = ""
    if source_path:
        suffix = source_path.suffix.casefold()
        source_name = f"source{suffix}"
        shutil.move(str(source_path), document_dir / source_name)
    timestamp = now_iso()
    record = {
        "id": document_id,
        "title": str(title or "Untitled document").strip()[:240] or "Untitled document",
        "format": format_name,
        "sourceFile": source_name,
        "characterCount": len(clean_text),
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }
    (document_dir / "text.txt").write_text(clean_text, encoding="utf-8")
    atomic_write_json(document_dir / "meta.json", record)
    return record


def delete_narration_document(document_id: str) -> dict:
    document_dir = narration_document_dir(document_id)
    record = narration_metadata(document_dir)
    shutil.rmtree(document_dir)
    return record
