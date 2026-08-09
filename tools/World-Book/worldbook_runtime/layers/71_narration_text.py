# Narration extraction quality helpers -------------------------------------

NARRATION_HEADING_WORDS = {
    "a", "after", "alexander", "alexandria", "and", "ape", "beyond", "chapter",
    "europe", "from", "ganges", "guns", "history", "indus", "kingdom", "middle",
    "of", "part", "pharaohs", "plagues", "plows", "science", "section", "solar",
    "stirrups", "system", "the", "to", "world",
}
NARRATION_PRESERVED_COMPOUNDS = {
    "cost-effective", "decision-making", "evidence-based", "first-class", "full-time",
    "half-life", "high-quality", "ice-cream", "long-term", "low-level", "mother-in-law",
    "north-east", "part-time", "peer-reviewed", "real-time", "self-aware", "short-term",
    "state-of-the-art", "user-facing", "well-known", "world-wide",
}
NARRATION_BROKEN_WORDS = {
    "aristo-tle", "coperni-cus", "exam-ple", "fore-bears", "man-ual",
    "pre-determined", "ques-tion", "tra-dition",
}
NARRATION_METADATA_SENTINEL = "\ue000"


def narration_median(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[middle])
    return (float(ordered[middle - 1]) + float(ordered[middle])) / 2


def narration_segment_heading(joined: str) -> list[str] | None:
    lowered = joined.casefold()
    memo: dict[int, list[list[str]]] = {}

    def visit(start: int) -> list[list[str]]:
        if start == len(lowered):
            return [[]]
        if start in memo:
            return memo[start]
        results = []
        for end in range(start + 1, len(lowered) + 1):
            if lowered[start:end] not in NARRATION_HEADING_WORDS:
                continue
            for rest in visit(end):
                results.append([joined[start:end], *rest])
                if len(results) > 2:
                    break
        memo[start] = results
        return results

    candidates = sorted((item for item in visit(0) if item), key=len)
    if not candidates or (len(candidates) > 1 and len(candidates[0]) == len(candidates[1])):
        return None
    return candidates[0]


def narration_join_fragment(match) -> str:
    left, right = match.group(1), match.group(2)
    pair = f"{left}-{right}".casefold()
    if pair in NARRATION_PRESERVED_COMPOUNDS:
        return f"{left}-{right}"
    if right[:1].islower() and pair in NARRATION_BROKEN_WORDS:
        return f"{left}{right}"
    return f"{left}-{right}"


def narration_join_spaced_fragment(match) -> str:
    left, spacing, right = match.group(1), match.group(2), match.group(3)
    pair = f"{left}-{right}".casefold()
    if right[:1].islower() and pair in NARRATION_BROKEN_WORDS:
        return f"{left}{right}"
    return f"{left}-{spacing}{right}"


def normalize_narration_text(value: str, metadata_replacement: str = "") -> str:
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n").replace("\u00ad", "")
    replacement = f" {metadata_replacement} " if metadata_replacement else NARRATION_METADATA_SENTINEL
    metadata_patterns = [
        r"\([^)]*(?:EBSCOhost|eBook Collection)[^)]*\)",
        r"\((?:Source|Credit)\s*:[^)]*\)",
        r"^.*(?:EBSCOhost\s*:|eBook Collection\s*\(EBSCOhost\)|printed on .* UTC via .*|All use subject to .*ebsco).*$",
        r"https?://(?:www\.\s*)?ebsco\.\s*com/terms-of-use\.?",
    ]
    for pattern in metadata_patterns:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE | re.MULTILINE)

    text = re.sub(
        r"([^\W\d_]{2,})-[ \t]*\n[ \t]*([^\W\d_]{2,})",
        narration_join_fragment,
        text,
    )
    text = re.sub(
        r"\b([^\W\d_]{2,})-([ \t]+)([^\W\d_]{2,})\b",
        narration_join_spaced_fragment,
        text,
    )
    text = re.sub(
        r"\b([^\W\d_]{2,})-([^\W\d_]{2,})\b",
        lambda match: (
            f"{match.group(1)}{match.group(2)}"
            if f"{match.group(1)}-{match.group(2)}".casefold() in NARRATION_BROKEN_WORDS
            else match.group(0)
        ),
        text,
    )

    def repair_heading(match) -> str:
        joined = re.sub(r"\s+", "", match.group(0))
        words = narration_segment_heading(joined)
        return " ".join(words) if words else match.group(0)

    text = re.sub(r"(?<![A-Za-z])(?:[A-Z][ \t]+){3,}[A-Z](?![A-Za-z])", repair_heading, text)
    lines = []
    for line in text.split("\n"):
        if line.strip() == NARRATION_METADATA_SENTINEL:
            continue
        clean = line.replace(NARRATION_METADATA_SENTINEL, "")
        lines.append(re.sub(r"[ \t]+", " ", clean).strip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def narration_render_pdf_line(spans: list[dict], direction: tuple[float, float]) -> str:
    rtl = float(direction[0] or 0) < 0
    ordered = sorted(spans, key=lambda item: float((item.get("bbox") or [0])[0]), reverse=rtl)
    output = ""
    previous = None
    for span in ordered:
        raw = str(span.get("text") or "")
        if not raw.strip():
            continue
        bbox = span.get("bbox") or [0, 0, 0, 0]
        font_size = abs(float(span.get("size") or 10)) or 10
        if previous and output and not output[-1].isspace() and not raw[0].isspace():
            previous_box = previous.get("bbox") or [0, 0, 0, 0]
            gap = float(previous_box[0]) - float(bbox[2]) if rtl else float(bbox[0]) - float(previous_box[2])
            if (not re.match(r"^[,.;:!?%\)\]\}]", raw)
                    and not re.search(r"[\(\[\{]$", output)
                    and gap > max(0.8, font_size * 0.12)):
                output += " "
        output += raw
        previous = span
    return re.sub(r"[ \t]+", " ", output).strip()


def narration_pdf_layout_lines(page) -> tuple[list[dict], float]:
    payload = page.get_text("dict", sort=False)
    lines = []
    total = 0
    for block in payload.get("blocks") or []:
        if int(block.get("type") or 0) != 0:
            continue
        for line in block.get("lines") or []:
            total += 1
            direction = tuple(line.get("dir") or (1.0, 0.0))
            if len(direction) < 2 or abs(float(direction[1] or 0)) > max(0.25, abs(float(direction[0] or 0)) * 0.5):
                continue
            spans = [span for span in (line.get("spans") or []) if str(span.get("text") or "").strip()]
            if not spans:
                continue
            text = narration_render_pdf_line(spans, direction)
            bbox = line.get("bbox") or [
                min(float(span["bbox"][0]) for span in spans),
                min(float(span["bbox"][1]) for span in spans),
                max(float(span["bbox"][2]) for span in spans),
                max(float(span["bbox"][3]) for span in spans),
            ]
            if text:
                lines.append({
                    "text": text,
                    "x0": float(bbox[0]),
                    "y0": float(bbox[1]),
                    "x1": float(bbox[2]),
                    "y1": float(bbox[3]),
                    "fontSize": narration_median([abs(float(span.get("size") or 10)) for span in spans]) or 10,
                })
    return lines, (len(lines) / total if total else 1.0)


def narration_find_column_split(lines: list[dict]) -> float | None:
    if len(lines) < 4:
        return None
    page_min_x = min(line["x0"] for line in lines)
    page_max_x = max(line["x1"] for line in lines)
    page_width = page_max_x - page_min_x
    typical_font = narration_median([line["fontSize"] for line in lines]) or 10
    if page_width <= typical_font * 8:
        return None

    best = None
    for step in range(41):
        split_x = page_min_x + page_width * (0.25 + step * 0.0125)
        left = [line for line in lines if line["x1"] < split_x]
        right = [line for line in lines if line["x0"] > split_x]
        if len(left) < 2 or len(right) < 2:
            continue
        coverage = (len(left) + len(right)) / len(lines)
        balance = min(len(left), len(right)) / max(len(left), len(right))
        overlap = max(0.0, min(max(line["y1"] for line in left), max(line["y1"] for line in right))
                      - max(min(line["y0"] for line in left), min(line["y0"] for line in right)))
        shorter_span = max(typical_font, min(
            max(line["y1"] for line in left) - min(line["y0"] for line in left),
            max(line["y1"] for line in right) - min(line["y0"] for line in right),
        ))
        overlap_ratio = overlap / shorter_span
        gutter = min(line["x0"] for line in right) - max(line["x1"] for line in left)
        minimum_gutter = max(typical_font * 1.5, page_width * 0.035)
        if gutter < minimum_gutter or coverage < 0.6 or balance < 0.35 or overlap_ratio < 0.25:
            continue
        alignment_penalty = 0.0
        for column in (left, right):
            if len(column) < 3:
                continue
            center = narration_median([line["x0"] for line in column])
            alignment_penalty += sum(abs(line["x0"] - center) for line in column) / len(column) / page_width
        score = (coverage * 0.45 + balance * 0.2
                 + min(1.0, gutter / (page_width * 0.12)) * 0.2
                 + min(1.0, overlap_ratio) * 0.15
                 - min(0.18, alignment_penalty * 0.55))
        if best is None or score > best[1]:
            best = (split_x, score)
    return best[0] if best else None


def narration_top_to_bottom(lines: list[dict]) -> list[dict]:
    return sorted(lines, key=lambda line: (line["y0"], line["x0"]))


def order_narration_pdf_lines(lines: list[dict]) -> list[dict]:
    split_x = narration_find_column_split(lines)
    if split_x is None:
        return narration_top_to_bottom(lines)
    ordered = []
    section = []

    def flush() -> None:
        if not section:
            return
        ordered.extend(narration_top_to_bottom([line for line in section if line["x1"] < split_x]))
        ordered.extend(narration_top_to_bottom([line for line in section if line["x0"] > split_x]))
        ordered.extend(narration_top_to_bottom([
            line for line in section if line["x0"] <= split_x <= line["x1"]
        ]))
        section.clear()

    for line in narration_top_to_bottom(lines):
        if line["x0"] <= split_x <= line["x1"]:
            flush()
            ordered.append(line)
        else:
            section.append(line)
    flush()
    return ordered


def extract_narration_pdf_page(page) -> dict:
    try:
        lines, confidence = narration_pdf_layout_lines(page)
    except Exception:
        lines, confidence = [], 0.0
    if lines and confidence >= 0.72:
        rendered = [line["text"] for line in order_narration_pdf_lines(lines) if line["text"]]
        return {"text": "\n".join(rendered), "lines": rendered}
    fallback = str(page.get_text("text", sort=True) or "").strip()
    return {"text": fallback, "lines": [line.strip() for line in fallback.splitlines() if line.strip()]}


def narration_margin_key(line: str) -> str:
    return re.sub(r"\s+", " ", str(line or "").casefold()).strip()


def combine_narration_pdf_pages(pages: list[dict]) -> str:
    if len(pages) < 3:
        return "\n\n".join(page["text"] for page in pages if page["text"])
    counts: dict[str, int] = {}
    numeric_top_pages = 0
    numeric_bottom_pages = 0
    for page in pages:
        lines = page["lines"]
        if len(lines) < 3:
            continue
        numeric_top_pages += int(lines[0].strip().isdecimal())
        numeric_bottom_pages += int(lines[-1].strip().isdecimal())
        for key in {f"top:{narration_margin_key(lines[0])}", f"bottom:{narration_margin_key(lines[-1])}"}:
            counts[key] = counts.get(key, 0) + 1
    threshold = max(3, int(len(pages) * 0.6 + 0.999999))
    output = []
    for page in pages:
        lines = list(page["lines"])
        remove_top = len(lines) >= 3 and (
            (lines[0].strip().isdecimal() and numeric_top_pages >= threshold)
            or counts.get(f"top:{narration_margin_key(lines[0])}", 0) >= threshold
        )
        remove_bottom = len(lines) >= 3 and (
            (lines[-1].strip().isdecimal() and numeric_bottom_pages >= threshold)
            or counts.get(f"bottom:{narration_margin_key(lines[-1])}", 0) >= threshold
        )
        if remove_top:
            lines.pop(0)
        if remove_bottom and lines:
            lines.pop()
        if lines:
            output.append("\n".join(lines))
    return "\n\n".join(output)
