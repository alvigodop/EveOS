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
    try:
        parts = urlsplit(raw)
        pairs = parse_qsl(parts.query, keep_blank_values=True)
        kept = [(key, val) for key, val in pairs if key.lower() not in _URL_TRACKING_PARAMS]
        if len(kept) != len(pairs):
            raw = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(kept), parts.fragment))
    except Exception:
        pass
    return _middle_truncate(raw, max_len)


def _summary_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    return []


def _summary_first(source, keys, fallback=""):
    for key in keys:
        value = (source or {}).get(key)
        if value not in (None, ""):
            return value
    return fallback


def _summary_timestamp(source):
    for key in ["lastEdited", "lastUpdated", "updatedAt", "dateAdded", "createdAt", "visitedAt", "lastVisited"]:
        value = (source or {}).get(key)
        if value not in (None, ""):
            return value
    return ""


def _summary_progress(source):
    return {
        "chapter": _summary_first(source, ["chapter", "graphicChapter", "novelChapter"]),
        "episode": _summary_first(source, ["episode"]),
        "season": _summary_first(source, ["season"]),
        "volume": _summary_first(source, ["volume"]),
        "progress": _summary_first(source, ["progress", "progressUnits"]),
    }


def _summary_related_urls(link):
    urls = []
    array_keys = [
        "relatedUrls",
        "additionalUrls",
        "extraUrls",
        "alternateUrls",
        "urlAlternates",
        "mirrors",
        "sources",
        "sourceUrls",
    ]
    scalar_keys = [
        "mirrorUrl",
        "sourceUrl",
        "wikiUrl",
        "alternateUrl",
        "additionalUrl",
        "mangaDexUrl",
        "anilistUrl",
        "malUrl",
        "fandomUrl",
    ]
    for key in array_keys:
        for entry in _summary_list((link or {}).get(key)):
            if isinstance(entry, dict):
                candidate = _summary_text(entry.get("url") or entry.get("href") or entry.get("link") or entry.get("source") or entry.get("value"))
            else:
                candidate = _summary_text(entry)
            if candidate:
                urls.append(_compact_url(candidate))
    for key in scalar_keys:
        candidate = _summary_text((link or {}).get(key))
        if candidate:
            urls.append(_compact_url(candidate))
    return [url for url in dict.fromkeys(urls) if url][:8]

def _summary_covers(link):
    additional = []
    for key in ["additionalCovers", "coverImages", "extraCovers"]:
        additional.extend(
            _compact_url(_summary_text(item.get("url") or item.get("src")) if isinstance(item, dict) else _summary_text(item))
            for item in _summary_list((link or {}).get(key))
        )
    additional = [value for value in dict.fromkeys(additional) if value]
    primary = _compact_url(_summary_text(_summary_first(link, ["coverImage", "cover", "imageUrl", "thumbnail", "thumbnailUrl"])))
    return {
        "primary": primary,
        "additional": additional[:8],
        "hasCover": bool(primary or additional),
        "hasAdditionalCovers": bool(additional),
    }


_DEFAULT_IDENTIFIER_LABELS = {
    "reading": "Reading",
    "watching": "Watching",
    "listening": "Listening",
    "playing": "Playing",
    "research": "Research",
    "reference": "Reference",
}


_RATING_PROVIDER_LABELS = {
    "anilist": "AniList",
    "myanimelist": "MyAnimeList",
    "mangadex": "MangaDex",
    "kitsu": "Kitsu",
    "tvmaze": "TVmaze",
    "mangaupdates": "MangaUpdates",
    "comick": "ComicK",
    "openlibrary": "OpenLibrary",
    "wlnupdates": "WlnUpdates",
    "itunes": "iTunes",
}


def _scalar(value):
    return None if value in (None, "") else value


def _compact_api_ratings(api_ratings):
    values = {}
    if isinstance(api_ratings, dict):
        for key, label in _RATING_PROVIDER_LABELS.items():
            value = _scalar(api_ratings.get(key, api_ratings.get(label, api_ratings.get(label.lower()))))
            if value is not None:
                values[key] = {"label": label, "score": value}
    providers = list(values.keys())
    return {"values": values, "presentProviders": providers, "count": len(providers)}


def _compact_derived_ratings(derived_ratings):
    source = derived_ratings if isinstance(derived_ratings, dict) else {}
    mapping = {
        "activeValue": "unified",
        "hybrid10": "hybrid",
        "personal10": "personal10",
        "apiAverage10": "apiAverage",
        "apiWeighted10": "apiWeighted",
        "confidence": "confidence",
    }
    out = {}
    for key, label in mapping.items():
        value = _scalar(source.get(key))
        if value is not None:
            out[label] = value
    return out


def _source_context(source):
    if not isinstance(source, dict):
        return None
    provider = _summary_text(source.get("source") or source.get("provider") or source.get("site") or source.get("name"))
    title = _compact_text(_summary_text(source.get("title") or source.get("name") or source.get("label")), 120)
    url = _compact_url(_summary_text(source.get("providerUrl") or source.get("url") or source.get("sourceUrl") or source.get("link")))
    score = _scalar(source.get("score", source.get("rating", source.get("averageScore"))))
    return {
        "provider": provider,
        "title": title,
        "status": _summary_text(source.get("status") or source.get("state")),
        "score": score,
        "url": url,
        "type": _summary_text(source.get("type") or source.get("mediaType") or source.get("format")),
        "author": _summary_text(source.get("author")),
        "tags": [_summary_text(item) for item in _summary_list(source.get("tags")) if _summary_text(item)][:16],
        "genres": [_summary_text(item) for item in _summary_list(source.get("genres")) if _summary_text(item)][:16],
        "synonyms": list(dict.fromkeys([
            _summary_text(item)
            for item in (_summary_list(source.get("synonyms")) + _summary_list(source.get("altTitles") or source.get("alternativeTitles")))
            if _summary_text(item)
        ]))[:12],
        "progress": _summary_progress(source),
        "coverUrl": _compact_url(_summary_text(source.get("coverUrl") or source.get("image") or source.get("imageUrl"))),
    }


def _attached_sources(link, linked_entry):
    raw = []
    if isinstance((link or {}).get("sources"), list):
        raw.extend((link or {}).get("sources") or [])
    if isinstance((linked_entry or {}).get("sources"), list):
        raw.extend((linked_entry or {}).get("sources") or [])
    seen = set()
    out = []
    for source in raw:
        compact = _source_context(source)
        if not compact:
            continue
        key = f"{compact.get('provider')}|{compact.get('title')}|{compact.get('url')}".lower()
        if key in seen:
            continue
        seen.add(key)
        if compact.get("provider") or compact.get("title") or compact.get("url") or compact.get("score") is not None:
            out.append(compact)
    return out[:8]


def _rating_context(link, linked_entry):
    api = _compact_api_ratings((linked_entry or {}).get("apiRatings") or (link or {}).get("apiRatings"))
    derived = _compact_derived_ratings((linked_entry or {}).get("derivedRatings") or (link or {}).get("derivedRatings"))
    personal = _scalar(_summary_first(linked_entry, ["rating", "personalRating"], _summary_first(link, ["rating", "personalRating"])))
    return {
        "personal": personal,
        "api": api,
        "derived": derived,
        "summary": {
            "unified": derived.get("unified", derived.get("hybrid")),
            "apiAverage": derived.get("apiAverage"),
            "apiWeighted": derived.get("apiWeighted"),
            "confidence": derived.get("confidence"),
        },
    }


def _media_context(link, linked_entry, category_data):
    media_types = list(dict.fromkeys(
        _summary_text(item)
        for item in (_summary_list((linked_entry or {}).get("mediaTypes")) + _summary_list((link or {}).get("mediaTypes")))
        if _summary_text(item)
    ))[:8]
    return {
        "dataType": _summary_text((category_data or {}).get("dataType") or (linked_entry or {}).get("dataType") or (link or {}).get("dataType")),
        "mediaTypes": media_types,
        "flags": {
            "graphicNovels": "graphicNovels" in media_types,
            "films": "films" in media_types,
            "novels": "novels" in media_types,
        },
    }

def _summary_aliases(entry):
    aliases = []
    for key in ["aliases", "alternativeTitles", "altTitles", "titleAltNames", "otherNames", "synonyms"]:
        aliases.extend(_summary_text(value) for value in _summary_list((entry or {}).get(key)))
    return [value for value in dict.fromkeys(aliases) if value][:12]

def _bookmark_identifiers(link):
    ids = list(dict.fromkeys(
        _summary_text(item)
        for item in (
            _summary_list((link or {}).get("identifiers"))
            + _summary_list((link or {}).get("identifierIds"))
            + _summary_list((link or {}).get("bookmarkIdentifiers"))
        )
        if _summary_text(item)
    ))[:20]
    details = [{"id": item, "label": _DEFAULT_IDENTIFIER_LABELS.get(item, item), "description": ""} for item in ids]
    # No per-bookmark explanatory note here: the SYSTEM CONTEXT header already explains the
    # identifiers-vs-cardCategory distinction once, so repeating a sentence per bookmark only
    # burned tokens (~105 chars x every bookmark occurrence).
    return {
        "ids": ids,
        "labels": [item["label"] for item in details],
        "details": details,
    }

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


def _bookmark_context(link, linked_entry, pin_ref=None, order_number=None, folder_path="", category_data=None):
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
    notes_text = _summary_text(link.get("personalNotes") or link.get("notes") or linked_entry.get("notes") or linked_entry.get("summary") or linked_entry.get("description"))[:900]
    return {
        "id": link.get("id"),
        "title": _compact_text(_summary_text(link.get("title"), "Untitled"), _TEXT_LIMIT_TITLE),
        # One URL slot only (mirrors the browser-local builder): duplicating the primary URL at a
        # top-level `url` key doubled the token cost of every bookmark for zero extra information.
        "urls": {
            "primary": _compact_url(_summary_text(link.get("url") or link.get("href"))),
            "related": related_urls,
        },
        "workspace": workspace,
        "category": {"type": "card-container", "name": category, "note": "Not the bookmark identifier marker."},
        "cardCategory": category,
        "card": {"workspace": workspace, "name": category, "scopedKey": _scoped_key(workspace, category)},
        "folderId": _summary_text(link.get("folderId")),
        "folderPath": folder_path,
        "location": {
            "workspace": workspace,
            "cardName": category,
            "cardCategoryName": category,
            "folderId": _summary_text(link.get("folderId")),
            "folderPath": folder_path,
            "note": "cardName/cardCategoryName is the EveOS card container. bookmarkIdentifiers are the user-facing category/marker pills.",
        },
        "bookmarkIdentifiers": identifiers,
        "bookmarkLabels": identifiers.get("labels", []),
        "done": bool(link.get("done")),
        "taskStatus": "Done" if link.get("done") else "Pending",
        "pinned": bool(pin_ref or link.get("pinned")),
        "pin": pin_ref or None,
        "priority": _summary_text(link.get("priority")),
        "icon": _compact_url(_summary_text(link.get("icon") or link.get("favicon") or link.get("imageIcon"))),
        "status": _summary_first(linked_entry, ["status"], _summary_first(link, ["status", "readingStatus", "mediaStatus"])),
        "notes": notes_text,
        "progress": progress,
        "ratings": ratings,
        "timestamps": {
            "updated": _summary_timestamp(link) or _summary_timestamp(linked_entry),
            "dateAdded": link.get("dateAdded") or linked_entry.get("dateAdded") or "",
            "lastEdited": link.get("lastEdited") or linked_entry.get("lastEdited") or "",
            "lastVisited": link.get("lastVisited") or link.get("visitedAt") or "",
        },
        "tags": list(dict.fromkeys(_summary_text(item) for item in (_summary_list(link.get("tags")) + _summary_list(linked_entry.get("tags"))) if _summary_text(item)))[:30],
        "genres": list(dict.fromkeys(_summary_text(item) for item in (_summary_list(link.get("genres")) + _summary_list(linked_entry.get("genres"))) if _summary_text(item)))[:30],
        "identifiers": identifiers.get("ids", []),
        "covers": _summary_covers(link),
        "attachedSources": sources,
        "sourceProviders": list(dict.fromkeys(_summary_text(source.get("provider")) for source in sources if _summary_text(source.get("provider"))))[:12],
        "sort": {
            "customOrderNumber": order_number,
        },
        # Unlinked bookmarks get the bare flag (parity with the browser-local builder) — shipping
        # a full library block of empty strings per unlinked bookmark wasted ~400 chars each.
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
            "summary": _summary_text(linked_entry.get("summary") or linked_entry.get("description"))[:700],
            "ratings": ratings,
        } if linked_entry else {"linked": False},
    }

def _build_workspace_context(workspaces, bookmarks, limit=80):
    counts = {}
    cards = {}
    for link in bookmarks:
        workspace = _summary_text((link or {}).get("workspace"), "main")
        category = _summary_text((link or {}).get("category"), "Unsorted")
        counts[workspace] = counts.get(workspace, 0) + 1
        cards.setdefault(workspace, set()).add(category)

    def node_context(node):
        children = [node_context(child) for child in (node or {}).get("subTabs") or []]
        return {
            "id": _summary_text((node or {}).get("id"), "main"),
            "name": _summary_text((node or {}).get("name") or (node or {}).get("title"), _summary_text((node or {}).get("id"), "main")),
            "linkedTo": _summary_text((node or {}).get("linkedTo")),
            "isShortcut": bool(_summary_text((node or {}).get("linkedTo"))),
            "bookmarkCount": counts.get(_summary_text((node or {}).get("id"), "main"), 0),
            "cardCount": len(cards.get(_summary_text((node or {}).get("id"), "main"), set())),
            "children": children[:limit],
        }

    return [node_context(workspace) for workspace in (workspaces or [])[:limit]]


def _build_card_trees(bookmarks, folders, config, link_to_entry, pins, categories=None, sample_limit=25):
    by_bookmark_pin, by_card_pin, by_folder_pin = _pin_indexes(pins)
    links_by_card = {}
    for link in bookmarks:
        workspace = _summary_text((link or {}).get("workspace"), "main")
        category = _summary_text((link or {}).get("category"), "Unsorted")
        links_by_card.setdefault(_scoped_key(workspace, category), []).append(link)

    cards = []
    for scoped_key, card_links in sorted(links_by_card.items()):
        parsed = _parse_scoped_category_key(scoped_key)
        workspace = parsed["workspace_id"] or "main"
        category = parsed["category_name"]
        category_data = (categories or {}).get(scoped_key) or {}
        category_entries = category_data.get("entries") if isinstance(category_data, dict) else []
        settings = _card_order_settings(config, workspace, category)
        ordered_links = _sort_links_for_card(card_links, settings)
        folder_tree = (folders or {}).get(scoped_key) or {}
        _nodes, _by_id, children_by_parent = _build_folder_maps(folder_tree)
        folder_path_by_id = _folder_paths(folder_tree)
        links_by_folder = {}
        for index, link in enumerate(ordered_links):
            link_id = _summary_text((link or {}).get("id"))
            view = _bookmark_context(
                link,
                link_to_entry.get(link_id) or {},
                by_bookmark_pin.get(link_id),
                order_number=_order_number(settings["customOrderMap"], link_id, index + 1),
                folder_path=folder_path_by_id.get(_summary_text((link or {}).get("folderId")), ""),
                category_data=category_data,
            )
            links_by_folder.setdefault(_summary_text((link or {}).get("folderId")), []).append(view)

        def build_folder(node):
            folder_id = _summary_text((node or {}).get("id"))
            child_folders = [build_folder(child) for child in children_by_parent.get(folder_id, [])]
            direct_bookmarks = links_by_folder.get(folder_id, [])
            return {
                "id": folder_id,
                "name": _summary_text((node or {}).get("name"), "Folder"),
                "path": folder_path_by_id.get(folder_id, ""),
                "order": (node or {}).get("order"),
                "taskMode": _summary_text((node or {}).get("taskMode"), "inherit"),
                "clickBehaviorMode": _summary_text((node or {}).get("clickBehaviorMode"), "inherit"),
                "pinned": bool(by_folder_pin.get(f"{workspace}::{category}::{folder_id}")),
                "pin": by_folder_pin.get(f"{workspace}::{category}::{folder_id}"),
                "directBookmarkCount": len(direct_bookmarks),
                "bookmarks": direct_bookmarks[:sample_limit],
                "folders": child_folders,
            }

        root_bookmarks = links_by_folder.get("", [])
        cards.append({
            "workspace": workspace,
            "category": category,
            "scopedKey": scoped_key,
            "cardType": _summary_text((category_data or {}).get("dataType"), "bookmarks"),
            "libraryEntryCount": len(category_entries or []),
            "settings": {
                "taskModeEnabled": settings["taskModeEnabled"],
                "customOrderEnabled": settings["customOrderEnabled"],
                "customOrderSort": settings["customOrderSort"],
                "cardOrderIndex": settings["cardOrderIndex"],
            },
            "pinned": bool(by_card_pin.get(scoped_key)),
            "pin": by_card_pin.get(scoped_key),
            "bookmarkCount": len(card_links),
            "rootBookmarks": root_bookmarks[:sample_limit],
            "folders": [build_folder(folder) for folder in children_by_parent.get("", [])],
        })
        if len(cards) >= min(80, max(10, sample_limit * 2)):
            break
    return cards


def _compact_bookmark_for_view(link, linked_entry=None):
    # System-view samples are pointers into cardTrees, not full records (parity with the
    # browser-local builder's small view objects): the full ratings/tags/source payload for the
    # same bookmark already ships once in its card tree.
    identifiers = _bookmark_identifiers(link)
    return {
        "id": (link or {}).get("id"),
        "title": _compact_text((link or {}).get("title"), _TEXT_LIMIT_TITLE),
        "url": _compact_url((link or {}).get("url")),
        "workspace": (link or {}).get("workspace") or "main",
        "cardCategory": (link or {}).get("category") or "Unsorted",
        "bookmarkIdentifiers": {"ids": identifiers.get("ids", []), "labels": identifiers.get("labels", [])},
        "folderId": (link or {}).get("folderId") or "",
        "status": _summary_first(linked_entry or {}, ["status"], _summary_first(link, ["status", "readingStatus", "mediaStatus"])),
        "done": bool((link or {}).get("done")),
        "covers": _summary_covers(link),
    }

def _build_system_view_samples(bookmarks, link_to_entry, sample_limit=25):
    views = {
        "withCovers": [],
        "withAdditionalCovers": [],
        "missingCovers": [],
        "libraryLinked": [],
        "done": [],
        "pending": [],
        "withRelatedUrls": [],
    }
    for link in bookmarks:
        linked_entry = link_to_entry.get(_summary_text((link or {}).get("id"))) or {}
        compact = _compact_bookmark_for_view(link, linked_entry)
        covers = _summary_covers(link)
        if covers["hasCover"]:
            views["withCovers"].append(compact)
        else:
            views["missingCovers"].append(compact)
        if covers["hasAdditionalCovers"]:
            views["withAdditionalCovers"].append(compact)
        if linked_entry:
            views["libraryLinked"].append(compact)
        if (link or {}).get("done"):
            views["done"].append(compact)
        else:
            views["pending"].append(compact)
        if _summary_related_urls(link):
            views["withRelatedUrls"].append(compact)
    return {
        name: {
            "count": len(items),
            "samples": items[:sample_limit],
        }
        for name, items in views.items()
    }


def build_structured_scope(bookmarks, folders, config, link_to_entry, pins, categories=None, sample_limit=25):
    return {
        "workspaces": _build_workspace_context(config.get("workspaces") or [], bookmarks, limit=max(20, sample_limit)),
        "cardTrees": _build_card_trees(bookmarks, folders, config, link_to_entry, pins, categories=categories, sample_limit=sample_limit),
        # Every bookmark already ships in full inside cardTrees; each system view re-samples the
        # same bookmarks (done|pending + covers|missing always match), so big sample lists here
        # only duplicate tokens. 10 samples per view mirrors the browser-local builder's budget.
        "systemViews": _build_system_view_samples(bookmarks, link_to_entry, sample_limit=min(10, sample_limit)),
    }
