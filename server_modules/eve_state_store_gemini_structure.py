from server_modules.eve_state_store_layers_shared import (
    _parse_scoped_category_key,
    _scoped_key,
)


def _summary_text(value, fallback=""):
    text = str(value if value is not None else "").strip()
    return text or str(fallback or "").strip()


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
    for entry in _summary_list((link or {}).get("relatedUrls")):
        candidate = _summary_text(entry.get("url") or entry.get("href")) if isinstance(entry, dict) else _summary_text(entry)
        if candidate:
            urls.append(candidate)
    for key in ["mirrorUrl", "sourceUrl", "wikiUrl", "alternateUrl"]:
        candidate = _summary_text((link or {}).get(key))
        if candidate:
            urls.append(candidate)
    return list(dict.fromkeys(urls))[:8]


def _summary_covers(link):
    additional = []
    for key in ["additionalCovers", "coverImages", "extraCovers"]:
        additional.extend(
            _summary_text(item.get("url") or item.get("src")) if isinstance(item, dict) else _summary_text(item)
            for item in _summary_list((link or {}).get(key))
        )
    additional = [value for value in dict.fromkeys(additional) if value]
    primary = _summary_text(_summary_first(link, ["coverImage", "cover", "imageUrl", "thumbnail", "thumbnailUrl"]))
    return {
        "primary": primary,
        "additional": additional[:8],
        "hasCover": bool(primary or additional),
        "hasAdditionalCovers": bool(additional),
    }


def _summary_aliases(entry):
    aliases = []
    for key in ["aliases", "alternativeTitles", "altTitles", "titleAltNames", "otherNames"]:
        aliases.extend(_summary_text(value) for value in _summary_list((entry or {}).get(key)))
    return [value for value in dict.fromkeys(aliases) if value][:12]


def _bookmark_identifiers(link):
    ids = list(dict.fromkeys(_summary_text(item) for item in _summary_list((link or {}).get("identifiers")) if _summary_text(item)))[:20]
    labels = [_DEFAULT_IDENTIFIER_LABELS.get(item, item) for item in ids]
    return {"ids": ids, "labels": labels, "note": "Bookmark identifiers are the user-facing category/marker pills; cardCategory is only the card container."}


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


def _bookmark_context(link, linked_entry, pin_ref=None, order_number=None, folder_path=""):
    progress = _summary_progress(linked_entry)
    progress.update({key: value for key, value in _summary_progress(link).items() if value not in (None, "")})
    category = (link or {}).get("category") or "Unsorted"
    related_urls = _summary_related_urls(link)
    return {
        "id": (link or {}).get("id"),
        "title": (link or {}).get("title"),
        "url": (link or {}).get("url"),
        "urls": {
            "primary": (link or {}).get("url"),
            "related": related_urls,
        },
        "relatedUrls": related_urls,
        "workspace": (link or {}).get("workspace") or "main",
        "category": {"type": "card-container", "name": category, "note": "Not the bookmark identifier marker."},
        "cardCategory": category,
        "folderId": (link or {}).get("folderId") or "",
        "folderPath": folder_path,
        "location": {"workspace": (link or {}).get("workspace") or "main", "cardName": category, "cardCategoryName": category, "folderId": (link or {}).get("folderId") or "", "folderPath": folder_path},
        "bookmarkIdentifiers": _bookmark_identifiers(link),
        "done": bool((link or {}).get("done")),
        "taskStatus": "Done" if (link or {}).get("done") else "Pending",
        "pinned": bool(pin_ref or (link or {}).get("pinned")),
        "pin": pin_ref or None,
        "status": _summary_first(linked_entry, ["status"], _summary_first(link, ["status", "readingStatus", "mediaStatus"])),
        "notes": _summary_text((link or {}).get("notes"))[:700],
        "progress": progress,
        "timestamps": {
            "updated": _summary_timestamp(link) or _summary_timestamp(linked_entry),
            "dateAdded": (link or {}).get("dateAdded") or (linked_entry or {}).get("dateAdded") or "",
            "lastEdited": (link or {}).get("lastEdited") or (linked_entry or {}).get("lastEdited") or "",
            "lastVisited": (link or {}).get("lastVisited") or (link or {}).get("visitedAt") or "",
        },
        "tags": _summary_list((link or {}).get("tags"))[:30],
        "genres": _summary_list((link or {}).get("genres"))[:30],
        "identifiers": _summary_list((link or {}).get("identifiers"))[:20],
        "covers": _summary_covers(link),
        "sort": {
            "customOrderNumber": order_number,
        },
        "library": {
            "linked": bool(linked_entry),
            "title": linked_entry.get("title") if linked_entry else "",
            "status": linked_entry.get("status") if linked_entry else "",
            "aliases": _summary_aliases(linked_entry),
            "entryId": linked_entry.get("id") if linked_entry else "",
        },
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
    return {
        "id": (link or {}).get("id"),
        "title": (link or {}).get("title"),
        "url": (link or {}).get("url"),
        "workspace": (link or {}).get("workspace") or "main",
        "category": {"type": "card-container", "name": (link or {}).get("category") or "Unsorted"},
        "cardCategory": (link or {}).get("category") or "Unsorted",
        "bookmarkIdentifiers": _bookmark_identifiers(link),
        "folderId": (link or {}).get("folderId") or "",
        "status": _summary_first(linked_entry or {}, ["status"], _summary_first(link, ["status", "readingStatus", "mediaStatus"])),
        "done": bool((link or {}).get("done")),
        "tags": _summary_list((link or {}).get("tags"))[:12],
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
        "systemViews": _build_system_view_samples(bookmarks, link_to_entry, sample_limit=min(25, sample_limit)),
    }
