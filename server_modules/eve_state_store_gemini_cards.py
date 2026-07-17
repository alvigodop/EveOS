"""Folder trees, card ordering, pins, and structured bookmark projections."""

from server_modules.eve_state_store_layers_shared import _scoped_key
from server_modules.eve_state_store_gemini_compact import (
    _TEXT_LIMIT_TITLE,
    _compact_stored_notes,
    _compact_text,
    _compact_url,
    _prune_empty_deep,
    _summary_text,
)
from server_modules.eve_state_store_gemini_bookmarks import (
    _attached_sources,
    _bookmark_identifiers,
    _has_rating_signal,
    _media_context,
    _rating_context,
    _summary_aliases,
    _summary_covers,
    _summary_first,
    _summary_list,
    _summary_progress,
    _summary_related_urls,
    _summary_timestamp,
)
def _folder_nodes(tree):
    if isinstance(tree, dict):
        return list(tree.get("nodes") or tree.get("folders") or [])
    if isinstance(tree, list):
        return list(tree)
    return []


def _folder_sort_key(node):
    try:
        order = int((node or {}).get("order") or 0)
    except Exception:
        order = 0
    return (order, _summary_text((node or {}).get("name"), "Folder").lower(), _summary_text((node or {}).get("id")))


def _build_folder_maps(tree):
    nodes = []
    by_id = {}
    children = {}
    for raw in _folder_nodes(tree):
        if not isinstance(raw, dict):
            continue
        node_id = _summary_text(raw.get("id"))
        if not node_id or node_id in by_id:
            continue
        node = {
            "id": node_id,
            "name": _summary_text(raw.get("name") or raw.get("title"), "Folder"),
            "parentId": _summary_text(raw.get("parentId")),
            "order": raw.get("order"),
            "taskMode": _summary_text(raw.get("taskMode"), "inherit"),
            "clickBehaviorMode": _summary_text(raw.get("clickBehaviorMode"), "inherit"),
        }
        by_id[node_id] = node
        nodes.append(node)
    valid_ids = set(by_id.keys())
    for node in nodes:
        parent_id = node.get("parentId") if node.get("parentId") in valid_ids and node.get("parentId") != node.get("id") else ""
        node["parentId"] = parent_id
        children.setdefault(parent_id, []).append(node)
    for child_nodes in children.values():
        child_nodes.sort(key=_folder_sort_key)
    return nodes, by_id, children


def _folder_paths(tree):
    _nodes, by_id, _children = _build_folder_maps(tree)
    paths = {}
    for folder_id, node in by_id.items():
        parts = []
        cursor = node
        guard = 0
        while cursor and guard < 64:
            parts.insert(0, _summary_text(cursor.get("name"), "Folder"))
            cursor = by_id.get(_summary_text(cursor.get("parentId")))
            guard += 1
        paths[folder_id] = " / ".join(parts)
    return paths


def _card_order_index(config, workspace, category):
    order = ((config or {}).get("categoryOrderByWorkspace") or {}).get(_summary_text(workspace, "main"))
    if not isinstance(order, list):
        order = (config or {}).get("categoryOrder") if isinstance((config or {}).get("categoryOrder"), list) else []
    normalized = [_summary_text(item, "Unsorted") for item in order]
    try:
        return normalized.index(_summary_text(category, "Unsorted")) + 1
    except ValueError:
        return None


def _card_task_enabled(config, workspace, category):
    scoped_key = _scoped_key(workspace, category)
    hidden_scoped = set(_summary_text(item) for item in _summary_list((config or {}).get("hideStatsScoped")))
    hidden_legacy = set(_summary_text(item) for item in _summary_list((config or {}).get("hideStats")))
    return scoped_key not in hidden_scoped and _summary_text(category, "Unsorted") not in hidden_legacy


def _card_order_settings(config, workspace, category):
    scoped_key = _scoped_key(workspace, category)
    order_map = ((config or {}).get("customOrder") or {}).get(scoped_key) or {}
    return {
        "cardScopedKey": scoped_key,
        "taskModeEnabled": _card_task_enabled(config, workspace, category),
        "customOrderEnabled": scoped_key in set(_summary_list((config or {}).get("customOrderEnabled"))),
        "customOrderSort": ((config or {}).get("customOrderSort") or {}).get(scoped_key) or "none",
        "customOrderMap": order_map if isinstance(order_map, dict) else {},
        "cardOrderIndex": _card_order_index(config, workspace, category),
    }


def _pin_indexes(pins):
    by_bookmark = {}
    by_card = {}
    by_folder = {}
    for pin in pins or []:
        if not isinstance(pin, dict):
            continue
        target_type = _summary_text(pin.get("targetType")).lower()
        target_id = _summary_text(pin.get("targetId"))
        if not target_type or not target_id:
            continue
        ref = {
            "id": _summary_text(pin.get("id")),
            "targetType": target_type,
            "targetId": target_id,
            "scopeType": _summary_text(pin.get("scopeType"), "tab"),
            "order": pin.get("order"),
        }
        if target_type == "bookmark":
            by_bookmark[target_id] = ref
        elif target_type == "card":
            by_card[target_id] = ref
        elif target_type == "folder":
            by_folder[target_id] = ref
    return by_bookmark, by_card, by_folder


def _order_number(order_map, link_id, fallback):
    raw = (order_map or {}).get(_summary_text(link_id))
    try:
        return int(raw)
    except Exception:
        return fallback


def _sort_links_for_card(links, settings):
    order_map = settings.get("customOrderMap") if isinstance(settings, dict) else {}
    sort_mode = _summary_text((settings or {}).get("customOrderSort"), "none")
    if sort_mode not in {"asc", "desc"}:
        return list(links or [])
    reverse = sort_mode == "desc"
    return sorted(list(links or []), key=lambda link: (
        _order_number(order_map, (link or {}).get("id"), 999999),
        _summary_text((link or {}).get("title")).lower(),
    ), reverse=reverse)


def _bookmark_context(link, linked_entry, pin_ref=None, order_number=None, category_data=None, workspace_names=None):
    """Slim bookmark shape (parity with the browser-local builder).

    One locator string (`card` = "workspace::cardName") instead of the old location/card/
    category/cardCategory quadruplication, no per-bookmark explainer sentences (the SYSTEM
    CONTEXT header explains the schema once), no taskStatus (done covers it), no bookmarkLabels
    or top-level identifiers (bookmarkIdentifiers covers both), ratings only when a rating
    exists, covers only when a cover exists. Folder placement is encoded by nesting inside the
    folder tree. Empty fields are stripped later by _prune_empty_deep.
    """
    link = link or {}
    linked_entry = linked_entry or {}
    category_data = category_data or {}
    progress = _summary_progress(linked_entry)
    progress.update({key: value for key, value in _summary_progress(link).items() if value not in (None, "")})
    category = _summary_text(link.get("category"), "Unsorted")
    workspace = _summary_text(link.get("workspace"), "main")
    related_urls = _summary_related_urls(link)
    identifiers = _bookmark_identifiers(link)
    sources = _attached_sources(link, linked_entry)
    ratings = _rating_context(link, linked_entry)
    media = _media_context(link, linked_entry, category_data)
    covers = _summary_covers(link)
    notes_text = _compact_stored_notes(
        link.get("personalNotes") or link.get("notes"), 900, workspace_names,
    )
    return {
        "id": link.get("id"),
        "title": _compact_text(_summary_text(link.get("title"), "Untitled"), _TEXT_LIMIT_TITLE),
        "urls": {
            "primary": _compact_url(_summary_text(link.get("url") or link.get("href"))),
            "related": related_urls,
        },
        "card": _scoped_key(workspace, category),
        "bookmarkIdentifiers": identifiers,
        "done": bool(link.get("done")),
        "pinned": True if (pin_ref or link.get("pinned")) else None,
        "pin": pin_ref or None,
        "priority": _summary_text(link.get("priority")),
        "icon": _compact_url(_summary_text(link.get("icon") or link.get("favicon") or link.get("imageIcon"))),
        "status": _summary_first(linked_entry, ["status"], _summary_first(link, ["status", "readingStatus", "mediaStatus"])),
        "notes": notes_text,
        "progress": progress,
        "ratings": ratings if _has_rating_signal(ratings) else None,
        "timestamps": {
            "updated": _summary_timestamp(link) or _summary_timestamp(linked_entry),
            "dateAdded": link.get("dateAdded") or linked_entry.get("dateAdded") or "",
            "lastVisited": link.get("lastVisited") or link.get("visitedAt") or "",
        },
        "tags": list(dict.fromkeys(_summary_text(item) for item in (_summary_list(link.get("tags")) + _summary_list(linked_entry.get("tags"))) if _summary_text(item)))[:30],
        "genres": list(dict.fromkeys(_summary_text(item) for item in (_summary_list(link.get("genres")) + _summary_list(linked_entry.get("genres"))) if _summary_text(item)))[:30],
        "covers": covers if covers.get("hasCover") else None,
        "attachedSources": sources,
        "sourceProviders": list(dict.fromkeys(_summary_text(source.get("provider")) for source in sources if _summary_text(source.get("provider"))))[:12],
        "sort": {"customOrderNumber": order_number} if order_number is not None else None,
        "library": {
            "linked": True,
            "title": _compact_text(linked_entry.get("title"), _TEXT_LIMIT_TITLE),
            "status": linked_entry.get("status") or "",
            "aliases": _summary_aliases(linked_entry),
            "entryId": linked_entry.get("id") or "",
            "media": media,
            "author": _summary_text(linked_entry.get("author")),
            "authorAltNames": _summary_list(linked_entry.get("authorAltNames"))[:12],
            "artist": _summary_text(linked_entry.get("artist")),
            "language": _summary_text(linked_entry.get("language")),
            "sourceUrl": _compact_url(_summary_text(linked_entry.get("sourceUrl"))),
            "summary": _compact_stored_notes(linked_entry.get("summary") or linked_entry.get("description"), 700, workspace_names),
        } if linked_entry else {"linked": False},
    }
