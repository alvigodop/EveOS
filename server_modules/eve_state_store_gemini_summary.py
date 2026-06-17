import time

from server_modules.eve_state_store_layers_shared import (
    _connection_entry_id,
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


def build_gemini_summary(state, sample_limit=25):
    metadata = (state or {}).get("metadata") or {}
    bookmarks = list((state or {}).get("bookmarks", {}).get("links") or [])
    categories = (state or {}).get("library", {}).get("categories") or {}
    connections = list((state or {}).get("library", {}).get("connections") or [])
    folders = (state or {}).get("bookmarks", {}).get("folders") or {}

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
                    "title": (entry or {}).get("title"),
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

    bookmark_samples = []
    for link in bookmarks[:sample_limit]:
        linked_entry = link_to_entry.get(_summary_text((link or {}).get("id"))) or {}
        bookmark_samples.append({
            "id": (link or {}).get("id"),
            "title": (link or {}).get("title"),
            "url": (link or {}).get("url"),
            "workspace": (link or {}).get("workspace") or "main",
            "category": (link or {}).get("category") or "Unsorted",
            "folderId": (link or {}).get("folderId") or "",
            "done": bool((link or {}).get("done")),
            "pinned": bool((link or {}).get("pinned")),
            "status": _summary_first(linked_entry, ["status"], _summary_first(link, ["status", "readingStatus", "mediaStatus"])),
            "notes": _summary_text((link or {}).get("notes"))[:700],
            "progress": {**_summary_progress(linked_entry), **{key: value for key, value in _summary_progress(link).items() if value not in (None, "")}},
            "timestamps": {
                "updated": _summary_timestamp(link) or _summary_timestamp(linked_entry),
                "dateAdded": (link or {}).get("dateAdded") or (linked_entry or {}).get("dateAdded") or "",
                "lastEdited": (link or {}).get("lastEdited") or (linked_entry or {}).get("lastEdited") or "",
                "lastVisited": (link or {}).get("lastVisited") or (link or {}).get("visitedAt") or "",
            },
            "tags": _summary_list((link or {}).get("tags"))[:20],
            "relatedUrls": _summary_related_urls(link),
            "library": {
                "linked": bool(linked_entry),
                "title": linked_entry.get("title") if linked_entry else "",
                "aliases": _summary_aliases(linked_entry),
                "entryId": linked_entry.get("id") if linked_entry else "",
            },
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
        "samples": {
            "bookmarks": bookmark_samples,
            "libraryEntries": library_samples,
            "recentlyUpdated": [{
                "id": (link or {}).get("id"),
                "title": (link or {}).get("title"),
                "workspace": (link or {}).get("workspace") or "main",
                "category": (link or {}).get("category") or "Unsorted",
                "updated": _summary_timestamp(link),
            } for link in recent_updated if _summary_timestamp(link)],
        },
    }
