import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from server_modules.eve_state_store_layers_shared import (
    _parse_scoped_category_key,
    _scoped_key,
)


def _summary_text(value, fallback=""):
    text = str(value if value is not None else "").strip()
    return text or str(fallback or "").strip()


# Token-budget parity with the browser-local builder (modular-state-sync.api.context.local.js):
# every free-text / URL field that reaches Gemini is capped, so one bookmark with a huge title or
# a 600-char tracking URL cannot eat hundreds of context tokens on the server relay path.
_TEXT_LIMIT_TITLE = 160
_URL_LIMIT = 180

_URL_TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "utm_id", "utm_name", "fbclid", "gclid", "mc_cid", "mc_eid", "igshid",
}


def _compact_text(value, max_len=240):
    normalized = " ".join(str(value if value is not None else "").split())
    limit = max(0, int(max_len or 0))
    if not limit:
        return ""
    if len(normalized) <= limit:
        return normalized
    return normalized[:max(0, limit - 3)].strip() + "..."


def _middle_truncate(value, max_len=_URL_LIMIT):
    raw = "".join(str(value if value is not None else "").split())
    limit = max(24, int(max_len or _URL_LIMIT))
    if len(raw) <= limit:
        return raw
    head = -(-(limit - 3) * 58 // 100)  # ceil(58%) — keep the identifying host/path start
    tail = max(8, limit - 3 - head)
    return f"{raw[:head]}...{raw[-tail:]}"


def _compact_url(value, max_len=_URL_LIMIT):
    raw = str(value if value is not None else "").strip()
    if not raw:
        return ""
    # Inline data: URIs are kilobytes of base64 that truncate into unusable noise — never ship.
    if raw.lower().startswith("data:"):
        return ""
    try:
        parts = urlsplit(raw)
        pairs = parse_qsl(parts.query, keep_blank_values=True)
        kept = [(key, val) for key, val in pairs if key.lower() not in _URL_TRACKING_PARAMS]
        if len(kept) != len(pairs):
            raw = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(kept), parts.fragment))
    except Exception:
        pass
    return _middle_truncate(raw, max_len)


def _is_empty_context_value(value):
    """Empty strings/lists/dicts and None carry no info; numbers and booleans always ship."""
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def _prune_empty_deep(value):
    if isinstance(value, list):
        pruned = [_prune_empty_deep(item) for item in value]
        return [item for item in pruned if not _is_empty_context_value(item)]
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            pruned = _prune_empty_deep(item)
            if not _is_empty_context_value(pruned):
                out[key] = pruned
        return out
    return value


# Stored notes can contain machine-written "=== Section ===" blocks (bookmark merge history,
# alternate links, discarded titles). Shipping those raw burned hundreds of tokens per bookmark
# on ids/timestamps the model can't use — compress each block to a one-line marker and keep only
# the user's freeform text. Mirrors compactStoredNotes in the browser-local builder.
_NOTE_SECTION_RE = re.compile(r"^===\s*(.+?)\s*===\s*$")


def _note_section_value(body, label):
    for line in body:
        if line.strip().lower().startswith(label):
            return line.split(":", 1)[1].strip() if ":" in line else ""
    return ""


def _compact_stored_notes(value, max_len=700, workspace_names=None):
    raw = str(value if value is not None else "")
    if not raw.strip():
        return ""
    names = workspace_names or {}
    freeform = []
    markers = []
    section = None

    def flush():
        nonlocal section
        if not section:
            return
        name = section["name"].lower()
        body = section["lines"]
        if name == "bookmark merge":
            merged_at = _note_section_value(body, "merged at")[:10]
            incoming_title = _note_section_value(body, "incoming title")
            scope_raw = _note_section_value(body, "incoming scope")
            from_part = ""
            if scope_raw:
                segments = [seg.strip() for seg in scope_raw.split("/") if seg.strip()][:2]
                if segments:
                    segments[0] = names.get(segments[0], segments[0])
                    from_part = " from " + "/".join(segments)
            title_part = f' "{_compact_text(incoming_title, 60)}"' if incoming_title else ""
            date_part = f" on {merged_at}" if merged_at else ""
            markers.append(f"[Merged{title_part}{from_part}{date_part}]")
        elif name == "alternate links":
            count = sum(1 for line in body if line.strip())
            if count:
                markers.append(f"[+{count} alternate link{'' if count == 1 else 's'} in stored notes]")
        elif name == "other titles":
            titles = [line.strip() for line in body if line.strip()]
            if titles:
                head = "; ".join(_compact_text(title, 50) for title in titles[:3])
                extra = f" (+{len(titles) - 3} more)" if len(titles) > 3 else ""
                markers.append(f"[Also titled: {head}{extra}]")
        elif name == "previous seasons/episodes":
            count = sum(1 for line in body if line.strip())
            if count:
                markers.append(f"[{count} previous season/episode marker{'' if count == 1 else 's'} in stored notes]")
        else:
            body_text = " ".join(body).strip()
            if body_text:
                markers.append(f"[{section['name']}: {_compact_text(body_text, 120)}]")
        section = None

    for line in raw.splitlines():
        match = _NOTE_SECTION_RE.match(line)
        if match:
            flush()
            section = {"name": match.group(1), "lines": []}
            continue
        if section is not None:
            section["lines"].append(line)
        else:
            freeform.append(line)
    flush()
    combined = " ".join(part for part in [" ".join(freeform).strip()] + markers if part)
    return _compact_text(combined, max_len)
