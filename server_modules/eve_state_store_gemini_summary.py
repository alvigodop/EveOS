import time

from server_modules.eve_state_store_layers_shared import (
    _connection_entry_id,
    _parse_scoped_category_key,
    _scoped_key,
)
from server_modules.eve_state_store_gemini_structure import (
    _TEXT_LIMIT_TITLE,
    _bookmark_identifiers,
    _compact_text,
    build_structured_scope,
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
        additional.extend(_summary_text(item.get("url") or item.get("src")) if isinstance(item, dict) else _summary_text(item) for item in _summary_list((link or {}).get(key)))
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


def _build_library_indexes(categories, connections):
    entries_by_id = {}
    entry_scope = {}
    for scoped_key, data in (categories or {}).items():
        parsed = _parse_scoped_category_key(scoped_key)
        for entry in (data or {}).get("entries") or []:
            entry_id = _summary_text((entry or {}).get("id"))
            if not entry_id:
                continue
            entries_by_id[entry_id] = entry
            entry_scope[entry_id] = {
                "workspace": parsed["workspace_id"] or "main",
                "category": parsed["category_name"],
                "scopedKey": scoped_key,
            }

    link_to_entry = {}
    for conn in connections or []:
        link_id = _summary_text((conn or {}).get("linkId") or (conn or {}).get("bookmarkId"))
        entry_id = _summary_text(_connection_entry_id(conn or {}))
        if link_id and entry_id and entry_id in entries_by_id:
            link_to_entry[link_id] = entries_by_id[entry_id]
    return entries_by_id, entry_scope, link_to_entry


def _count_folder_nodes(tree):
    if isinstance(tree, list):
        nodes = tree
    elif isinstance(tree, dict):
        nodes = tree.get("nodes") or tree.get("folders") or []
    else:
        nodes = []
    count = 0
    stack = list(nodes)
    while stack:
        node = stack.pop()
        if not isinstance(node, dict):
            continue
        count += 1
        stack.extend(node.get("children") or node.get("subFolders") or [])
    return count


def _build_folder_overview(folders):
    overview = {}
    total = 0
    for scoped_key, tree in (folders or {}).items():
        count = _count_folder_nodes(tree)
        total += count
        if len(overview) < 40:
            overview[scoped_key] = {"folderCount": count}
    return {"totalFolders": total, "byCard": overview}


def _increment(counter, key, amount=1):
    label = _summary_text(key, "Unknown")
    counter[label] = counter.get(label, 0) + amount


def _build_nexus_signals(bookmarks, categories, connections):
    tag_counts = {}
    identifier_counts = {}
    source_counts = {}
    health = {
        "missingIcons": 0,
        "missingCovers": 0,
        "withCovers": 0,
        "withAdditionalCovers": 0,
        "withNotes": 0,
        "withRelatedUrls": 0,
        "withProgress": 0,
        "libraryLinked": 0,
        "done": 0,
        "pending": 0,
    }
    for link in bookmarks:
        if not (link or {}).get("icon"):
            health["missingIcons"] += 1
        if (link or {}).get("coverImage") or (link or {}).get("cover"):
            health["withCovers"] += 1
        else:
            health["missingCovers"] += 1
        if _summary_list((link or {}).get("additionalCovers")) or _summary_list((link or {}).get("coverImages")):
            health["withAdditionalCovers"] += 1
        if _summary_text((link or {}).get("notes")):
            health["withNotes"] += 1
        if _summary_related_urls(link):
            health["withRelatedUrls"] += 1
        if any(value not in (None, "") for value in _summary_progress(link).values()):
            health["withProgress"] += 1
        health["done" if (link or {}).get("done") else "pending"] += 1
        for tag in _summary_list((link or {}).get("tags")):
            _increment(tag_counts, tag)
        for identifier in _summary_list((link or {}).get("identifiers")):
            _increment(identifier_counts, identifier)
        provider = _summary_text((link or {}).get("provider") or (link or {}).get("sourceProvider"))
        if provider:
            _increment(source_counts, provider)

    for data in (categories or {}).values():
        for entry in (data or {}).get("entries") or []:
            for tag in _summary_list((entry or {}).get("tags")):
                _increment(tag_counts, tag)
            provider = _summary_text((entry or {}).get("provider") or (entry or {}).get("sourceProvider"))
            if provider:
                _increment(source_counts, provider)

    health["libraryLinked"] = len(connections or [])
    top = lambda counter: dict(sorted(counter.items(), key=lambda item: item[1], reverse=True)[:30])
    return {
        "health": health,
        "topTags": top(tag_counts),
        "identifiers": top(identifier_counts),
        "sourceProviders": top(source_counts),
    }


def _folder_names_for_log(tree, limit=10):
    if isinstance(tree, dict):
        nodes = tree.get("nodes") or tree.get("folders") or []
    elif isinstance(tree, list):
        nodes = tree
    else:
        nodes = []
    names = []
    stack = list(nodes)
    while stack and len(names) < limit:
        node = stack.pop(0)
        if not isinstance(node, dict):
            continue
        names.append(_summary_text(node.get("name") or node.get("title"), "Folder"))
        stack.extend(node.get("children") or node.get("subFolders") or [])
    return names


def _build_nexus_log(bookmarks, folders, categories, connections, link_to_entry, sample_limit=25):
    links_by_id = {
        _summary_text((link or {}).get("id")): link
        for link in bookmarks
        if _summary_text((link or {}).get("id"))
    }
    recent_updates = sorted(
        [link for link in bookmarks if _summary_timestamp(link)],
        key=lambda item: str(_summary_timestamp(item) or ""),
        reverse=True
    )[:min(sample_limit, 20)]
    folder_cards = []
    for scoped_key, tree in (folders or {}).items():
        if len(folder_cards) >= min(sample_limit, 20):
            break
        folder_count = _count_folder_nodes(tree)
        if not folder_count:
            continue
        folder_cards.append({
            "scopedKey": scoped_key,
            "folderCount": folder_count,
            "folderNames": _folder_names_for_log(tree, limit=8),
        })
    linked_connections = []
    for conn in connections or []:
        if len(linked_connections) >= min(sample_limit, 20):
            break
        link_id = _summary_text((conn or {}).get("linkId") or (conn or {}).get("bookmarkId"))
        link = links_by_id.get(link_id) or {}
        entry = link_to_entry.get(link_id) or {}
        linked_connections.append({
            "linkId": link_id,
            "bookmarkTitle": _compact_text(_summary_text((link or {}).get("title"), "Untitled"), _TEXT_LIMIT_TITLE),
            "workspace": _summary_text((link or {}).get("workspace"), _summary_text((conn or {}).get("workspaceId"), "main")),
            "category": {"type": "card-container", "name": _summary_text((link or {}).get("category"), "Unsorted")},
            "cardCategory": _summary_text((link or {}).get("category"), "Unsorted"),
            "bookmarkIdentifiers": _bookmark_identifiers(link),
            "libraryEntryId": _summary_text(_connection_entry_id(conn or {})),
            "libraryTitle": _compact_text(_summary_text((entry or {}).get("title")), _TEXT_LIMIT_TITLE),
            "libraryStatus": _summary_text((entry or {}).get("status")),
        })
    system_hints = {
        "withCovers": sum(1 for link in bookmarks if _summary_covers(link)["hasCover"]),
        "withAdditionalCovers": sum(1 for link in bookmarks if _summary_covers(link)["hasAdditionalCovers"]),
        "withRelatedUrls": sum(1 for link in bookmarks if _summary_related_urls(link)),
        "libraryLinked": len(linked_connections),
        "done": sum(1 for link in bookmarks if (link or {}).get("done")),
        "pending": sum(1 for link in bookmarks if not (link or {}).get("done")),
    }
    return {
        "schema": "eveos.nexus-log.compact.v1",
        "source": "server-scoped-modular-state",
        "note": "Derived scoped Nexus log context. Live browser search traces are appended by the client when available.",
        "recentUpdates": [{
            "id": (link or {}).get("id"),
            "title": _compact_text((link or {}).get("title"), _TEXT_LIMIT_TITLE),
            "workspace": (link or {}).get("workspace") or "main",
            "category": {"type": "card-container", "name": (link or {}).get("category") or "Unsorted"},
            "cardCategory": (link or {}).get("category") or "Unsorted",
            "bookmarkIdentifiers": _bookmark_identifiers(link),
            "folderId": (link or {}).get("folderId") or "",
            "updated": _summary_timestamp(link),
            "status": _summary_first(link_to_entry.get(_summary_text((link or {}).get("id"))) or {}, ["status"], _summary_first(link, ["status", "readingStatus", "mediaStatus"])),
        } for link in recent_updates],
        "folderCards": folder_cards,
        "libraryConnections": linked_connections,
        "systemViewHints": system_hints,
    }


def build_gemini_summary(state, sample_limit=25):
    metadata = (state or {}).get("metadata") or {}
    bookmark_state = (state or {}).get("bookmarks", {}) or {}
    bookmarks = list(bookmark_state.get("links") or [])
    config = bookmark_state.get("config") or {}
    categories = (state or {}).get("library", {}).get("categories") or {}
    connections = list((state or {}).get("library", {}).get("connections") or [])
    folders = bookmark_state.get("folders") or {}
    pins = bookmark_state.get("pins") or []

    workspace_counts = {}
    category_counts = {}
    for link in bookmarks:
        workspace = str((link or {}).get("workspace") or "main")
        category = str((link or {}).get("category") or "Unsorted")
        workspace_counts[workspace] = workspace_counts.get(workspace, 0) + 1
        category_counts[_scoped_key(workspace, category)] = category_counts.get(_scoped_key(workspace, category), 0) + 1

    library_entry_count = 0
    status_counts = {}
    type_counts = {}
    library_samples = []
    _entries_by_id, _entry_scope, link_to_entry = _build_library_indexes(categories, connections)

    for scoped_key, data in categories.items():
        parsed = _parse_scoped_category_key(scoped_key)
        entries = list((data or {}).get("entries") or [])
        data_type = (data or {}).get("dataType") or "graphicNovels"
        type_counts[data_type] = type_counts.get(data_type, 0) + len(entries)
        library_entry_count += len(entries)
        for entry in entries:
            status = str((entry or {}).get("status") or "Unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
            if len(library_samples) < sample_limit:
                library_samples.append({
                    "id": (entry or {}).get("id"),
                    "title": _compact_text((entry or {}).get("title"), _TEXT_LIMIT_TITLE),
                    "workspace": parsed["workspace_id"] or "main",
                    "category": parsed["category_name"],
                    "status": (entry or {}).get("status") or "",
                    "aliases": _summary_aliases(entry),
                    "notes": _summary_text((entry or {}).get("notes") or (entry or {}).get("summary") or (entry or {}).get("description"))[:700],
                    "progress": _summary_progress(entry),
                    "timestamps": {
                        "updated": _summary_timestamp(entry),
                        "dateAdded": (entry or {}).get("dateAdded") or "",
                        "lastEdited": (entry or {}).get("lastEdited") or "",
                    },
                    "tags": _summary_list((entry or {}).get("tags"))[:20],
                    "rating": (entry or {}).get("rating"),
                    "confidence": ((entry or {}).get("derivedRatings") or {}).get("confidence"),
                })

    recent_updated = sorted(bookmarks, key=lambda item: str(_summary_timestamp(item) or ""), reverse=True)[:min(sample_limit, 25)]
    return {
        "kind": "eveos_modular_summary",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "scope": metadata.get("geminiScope") or {"scope": "all", "label": "Whole datapack"},
        "counts": {
            "bookmarks": len(bookmarks),
            "libraryEntries": library_entry_count,
            "connections": len(connections),
            "workspaces": len(workspace_counts),
            "cards": len(category_counts),
        },
        "breakdown": {
            "bookmarksByWorkspace": workspace_counts,
            "bookmarksByCard": category_counts,
            "libraryByStatus": status_counts,
            "libraryByDataType": type_counts,
            "folders": _build_folder_overview(folders),
            "nexusSignals": _build_nexus_signals(bookmarks, categories, connections),
        },
        "structuredScope": {
            **build_structured_scope(
                bookmarks,
                folders,
                config,
                link_to_entry,
                pins,
                categories=categories,
                sample_limit=sample_limit,
            ),
        },
        "nexusLog": _build_nexus_log(bookmarks, folders, categories, connections, link_to_entry, sample_limit=sample_limit),
        "samples": {
            # No `bookmarks` list here: every bookmark already ships fully structured inside
            # structuredScope.cardTrees, so repeating them all doubled the payload for Gemini.
            "libraryEntries": library_samples,
            "recentlyUpdated": [{
                "id": (link or {}).get("id"),
                "title": _compact_text((link or {}).get("title"), _TEXT_LIMIT_TITLE),
                "workspace": (link or {}).get("workspace") or "main",
                "category": {"type": "card-container", "name": (link or {}).get("category") or "Unsorted"},
                "cardCategory": (link or {}).get("category") or "Unsorted",
                "bookmarkIdentifiers": _bookmark_identifiers(link),
                "updated": _summary_timestamp(link),
            } for link in recent_updated if _summary_timestamp(link)],
        },
    }
