"""Top-level workspace, card-tree, and system-view builders for Gemini context."""

from server_modules.eve_state_store_layers_shared import (
    _parse_scoped_category_key,
    _scoped_key,
)
from server_modules.eve_state_store_gemini_compact import (
    _TEXT_LIMIT_TITLE,
    _compact_text,
    _compact_url,
    _summary_text,
)
from server_modules.eve_state_store_gemini_bookmarks import (
    _bookmark_identifiers,
    _summary_covers,
    _summary_first,
    _summary_related_urls,
)
from server_modules.eve_state_store_gemini_cards import (
    _bookmark_context,
    _build_folder_maps,
    _card_order_settings,
    _order_number,
    _pin_indexes,
    _sort_links_for_card,
)
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
        linked_to = _summary_text((node or {}).get("linkedTo"))
        # linkedTo/isShortcut only on actual shortcut tabs — the empty/false pair on every
        # normal tab was pure noise.
        return {
            "id": _summary_text((node or {}).get("id"), "main"),
            "name": _summary_text((node or {}).get("name") or (node or {}).get("title"), _summary_text((node or {}).get("id"), "main")),
            "linkedTo": linked_to or None,
            "isShortcut": True if linked_to else None,
            "bookmarkCount": counts.get(_summary_text((node or {}).get("id"), "main"), 0),
            "cardCount": len(cards.get(_summary_text((node or {}).get("id"), "main"), set())),
            "children": children[:limit],
        }

    return [node_context(workspace) for workspace in (workspaces or [])[:limit]]


def _build_card_trees(bookmarks, folders, config, link_to_entry, pins, categories=None, sample_limit=25, workspace_names=None):
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
        _nodes, by_id, children_by_parent = _build_folder_maps(folder_tree)
        links_by_folder = {}
        for index, link in enumerate(ordered_links):
            link_id = _summary_text((link or {}).get("id"))
            # customOrderNumber only when the user explicitly ordered this bookmark — the
            # fallback (array index) is already encoded by list position.
            explicit_order = (
                _order_number(settings["customOrderMap"], link_id, index + 1)
                if link_id in (settings["customOrderMap"] or {})
                else None
            )
            view = _bookmark_context(
                link,
                link_to_entry.get(link_id) or {},
                by_bookmark_pin.get(link_id),
                order_number=explicit_order,
                category_data=category_data,
                workspace_names=workspace_names,
            )
            links_by_folder.setdefault(_summary_text((link or {}).get("folderId")), []).append(view)

        # Folder shape: nesting already encodes the path, `inherit` is the default for both mode
        # fields, and pinned:false is the default — ship only real signals.
        def build_folder(node):
            folder_id = _summary_text((node or {}).get("id"))
            child_folders = [build_folder(child) for child in children_by_parent.get(folder_id, [])]
            direct_bookmarks = links_by_folder.get(folder_id, [])
            task_mode = _summary_text((node or {}).get("taskMode"), "inherit")
            click_mode = _summary_text((node or {}).get("clickBehaviorMode"), "inherit")
            shipped = direct_bookmarks[:sample_limit]
            return {
                "id": folder_id,
                "name": _summary_text((node or {}).get("name"), "Folder"),
                "taskMode": task_mode if task_mode != "inherit" else None,
                "clickBehaviorMode": click_mode if click_mode != "inherit" else None,
                "pinned": True if by_folder_pin.get(f"{workspace}::{category}::{folder_id}") else None,
                "pin": by_folder_pin.get(f"{workspace}::{category}::{folder_id}"),
                "directBookmarkCount": len(direct_bookmarks) if len(direct_bookmarks) > len(shipped) else None,
                "bookmarks": shipped,
                "folders": child_folders,
            }

        root_bookmarks = links_by_folder.get("", [])
        # Bookmarks whose folderId no longer exists in the tree used to be silently dropped from
        # the card tree — surface them as detachedBookmarks (parity with the browser builder).
        detached_bookmarks = [
            view
            for folder_id, views in links_by_folder.items()
            if folder_id and folder_id not in by_id
            for view in views
        ]
        cards.append({
            "scopedKey": scoped_key,
            "cardName": category,
            # Explicit owning-tab attribution: the scopedKey's workspace half is a raw id the
            # model cannot trace, which made it attribute sub-tab cards to parent tabs.
            "tabId": workspace,
            "tabName": (workspace_names or {}).get(workspace) or workspace,
            "cardType": _summary_text((category_data or {}).get("dataType"), "bookmarks"),
            "libraryEntryCount": len(category_entries or []),
            "settings": {
                "taskModeEnabled": settings["taskModeEnabled"],
                "customOrderEnabled": True if settings["customOrderEnabled"] else None,
                "customOrderSort": settings["customOrderSort"] if settings["customOrderSort"] != "none" else None,
                "cardOrderIndex": settings["cardOrderIndex"],
            },
            "pinned": True if by_card_pin.get(scoped_key) else None,
            "pin": by_card_pin.get(scoped_key),
            "bookmarkCount": len(card_links),
            "rootBookmarks": root_bookmarks[:sample_limit],
            "detachedBookmarks": detached_bookmarks[:sample_limit],
            "folders": [build_folder(folder) for folder in children_by_parent.get("", [])],
        })
        if len(cards) >= min(80, max(10, sample_limit * 2)):
            break
    return cards


def _compact_bookmark_for_view(link, linked_entry=None):
    # System-view samples are pointers into cardTrees, not full records (parity with the
    # browser-local builder's small view objects): the full record for the same bookmark
    # already ships once in its card tree.
    identifiers = _bookmark_identifiers(link)
    return {
        "id": (link or {}).get("id"),
        "title": _compact_text((link or {}).get("title"), _TEXT_LIMIT_TITLE),
        "url": _compact_url((link or {}).get("url")),
        "card": _scoped_key(
            _summary_text((link or {}).get("workspace"), "main"),
            _summary_text((link or {}).get("category"), "Unsorted"),
        ),
        "bookmarkIdentifiers": identifiers,
        "status": _summary_first(linked_entry or {}, ["status"], _summary_first(link, ["status", "readingStatus", "mediaStatus"])),
        "done": bool((link or {}).get("done")),
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


def _collect_workspace_names(nodes, names=None):
    """id -> display name, so merge-note markers can say "from test/Reading" instead of ws ids."""
    names = names if names is not None else {}
    for node in nodes or []:
        if not isinstance(node, dict):
            continue
        node_id = _summary_text(node.get("id"))
        if node_id:
            names[node_id] = _summary_text(node.get("name") or node.get("title"), node_id)
        _collect_workspace_names(node.get("subTabs"), names)
    return names


def build_structured_scope(bookmarks, folders, config, link_to_entry, pins, categories=None, sample_limit=25):
    workspace_names = _collect_workspace_names(config.get("workspaces") or [])
    return {
        "workspaces": _build_workspace_context(config.get("workspaces") or [], bookmarks, limit=max(20, sample_limit)),
        "cardTrees": _build_card_trees(bookmarks, folders, config, link_to_entry, pins, categories=categories, sample_limit=sample_limit, workspace_names=workspace_names),
        # Every bookmark already ships in full inside cardTrees; each system view re-samples the
        # same bookmarks (done|pending + covers|missing always match), so big sample lists here
        # only duplicate tokens. 10 samples per view mirrors the browser-local builder's budget.
        "systemViews": _build_system_view_samples(bookmarks, link_to_entry, sample_limit=min(10, sample_limit)),
    }
