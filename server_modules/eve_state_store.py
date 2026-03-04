import hashlib
import json
import logging
import os
import re
import shutil
import time
from http import HTTPStatus
from pathlib import Path

logger = logging.getLogger("FandomDiscoveryServer")

STORE_ROOT = Path(os.getcwd()) / "data" / "modular-state"
META_DIR = STORE_ROOT / "_meta"
TABS_DIR = STORE_ROOT / "tabs"
FORMAT_VERSION = 1


def _send_json(handler, status_code, payload):
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))


def _read_request_json(handler):
    try:
        content_length = int(handler.headers.get("Content-Length", "0"))
    except ValueError:
        content_length = 0
    if content_length <= 0:
        return None, "Empty request body"
    raw = handler.rfile.read(content_length)
    try:
        return json.loads(raw.decode("utf-8")), None
    except Exception as exc:
        return None, f"Invalid JSON body: {exc}"


def _slugify(value, fallback="item"):
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or fallback


def _folder_name(label, fallback):
    slug = _slugify(label, fallback)
    short_hash = hashlib.sha1(str(label or "").encode("utf-8")).hexdigest()[:6]
    return f"{slug}--{short_hash}"


def _parse_scoped_category_key(key):
    raw = str(key or "")
    if "::" not in raw:
        return {
            "workspace_id": "",
            "category_name": raw.strip() or "Unsorted"
        }
    workspace_id, category_name = raw.split("::", 1)
    return {
        "workspace_id": workspace_id.strip(),
        "category_name": category_name.strip() or "Unsorted"
    }


def _scoped_key(workspace_id, category_name):
    ws = str(workspace_id or "").strip() or "main"
    cat = str(category_name or "").strip() or "Unsorted"
    return f"{ws}::{cat}"


def _safe_filename(value, fallback):
    text = str(value or "").strip()
    text = re.sub(r'[<>:"/\\\\|?*\x00-\x1f]', "_", text)
    text = text.strip(" .")
    return text or fallback


def _connection_category_name(conn):
    return (
        conn.get("categoryName")
        or conn.get("category")
        or conn.get("libraryCategory")
        or "Unsorted"
    )


def _connection_entry_id(conn):
    return conn.get("libraryEntryId") or conn.get("entryId")


def _build_library_index(categories):
    by_scope = {}
    for key, data in (categories or {}).items():
        parsed = _parse_scoped_category_key(key)
        scoped = _scoped_key(parsed["workspace_id"] or "main", parsed["category_name"])
        entries = (data or {}).get("entries") or []
        entry_map = {}
        for entry in entries:
            entry_id = str((entry or {}).get("id") or "").strip()
            if entry_id:
                entry_map[entry_id] = entry
        by_scope[scoped] = {
            "data_type": (data or {}).get("dataType") or "graphicNovels",
            "entries": entry_map
        }
    return by_scope


def _build_workspaces(config):
    workspaces = list((config or {}).get("workspaces") or [])
    if not workspaces:
        workspaces = [{"id": "main", "name": "Main", "icon": "🏠"}]
    normalized = []
    seen = set()
    for ws in workspaces:
        ws_id = str((ws or {}).get("id") or "").strip() or "main"
        if ws_id in seen:
            continue
        seen.add(ws_id)
        normalized.append({
            "id": ws_id,
            "name": (ws or {}).get("name") or ws_id,
            "icon": (ws or {}).get("icon") or "📁"
        })
    return normalized


def _prepare_workspace_map(links, workspaces):
    by_workspace = {}
    for ws in workspaces:
        by_workspace[ws["id"]] = {
            "meta": ws,
            "links": [],
            "categories": {}
        }

    for link in links:
        item = dict(link or {})
        workspace_id = str(item.get("workspace") or "").strip() or "main"
        category_name = str(item.get("category") or "").strip() or "Unsorted"
        item["workspace"] = workspace_id
        item["category"] = category_name
        if workspace_id not in by_workspace:
            by_workspace[workspace_id] = {
                "meta": {"id": workspace_id, "name": workspace_id, "icon": "📁"},
                "links": [],
                "categories": {}
            }
        by_workspace[workspace_id]["links"].append(item)
        by_workspace[workspace_id]["categories"].setdefault(category_name, []).append(item)

    return by_workspace


def _ensure_clean_store():
    if STORE_ROOT.exists():
        shutil.rmtree(STORE_ROOT)
    META_DIR.mkdir(parents=True, exist_ok=True)
    TABS_DIR.mkdir(parents=True, exist_ok=True)


def _collect_status():
    if not STORE_ROOT.exists():
        return {
            "exists": False,
            "signature": "",
            "fileCount": 0,
            "lastModified": 0,
            "path": str(STORE_ROOT)
        }

    parts = []
    file_count = 0
    last_modified = 0

    for path in sorted(STORE_ROOT.rglob("*")):
        if not path.is_file():
            continue
        stat = path.stat()
        file_count += 1
        last_modified = max(last_modified, int(stat.st_mtime))
        rel = str(path.relative_to(STORE_ROOT)).replace("\\", "/")
        parts.append(f"{rel}:{stat.st_size}:{stat.st_mtime_ns}")

    signature = hashlib.sha1("\n".join(parts).encode("utf-8")).hexdigest() if parts else ""
    return {
        "exists": True,
        "signature": signature,
        "fileCount": file_count,
        "lastModified": last_modified,
        "path": str(STORE_ROOT)
    }


def _to_number(value, default):
    try:
        return int(value)
    except Exception:
        return default


def _build_gemini_summary(state, sample_limit=25):
    bookmarks = list((state or {}).get("bookmarks", {}).get("links") or [])
    categories = (state or {}).get("library", {}).get("categories") or {}
    connections = list((state or {}).get("library", {}).get("connections") or [])

    workspace_counts = {}
    category_counts = {}
    for link in bookmarks:
        workspace = str((link or {}).get("workspace") or "main")
        category = str((link or {}).get("category") or "Unsorted")
        workspace_counts[workspace] = workspace_counts.get(workspace, 0) + 1
        scoped = _scoped_key(workspace, category)
        category_counts[scoped] = category_counts.get(scoped, 0) + 1

    library_entry_count = 0
    status_counts = {}
    type_counts = {}
    library_samples = []

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
                    "rating": (entry or {}).get("rating"),
                    "confidence": ((entry or {}).get("derivedRatings") or {}).get("confidence")
                })

    bookmark_samples = []
    for link in bookmarks[:sample_limit]:
        bookmark_samples.append({
            "id": (link or {}).get("id"),
            "title": (link or {}).get("title"),
            "url": (link or {}).get("url"),
            "workspace": (link or {}).get("workspace") or "main",
            "category": (link or {}).get("category") or "Unsorted",
            "done": bool((link or {}).get("done")),
            "pinned": bool((link or {}).get("pinned"))
        })

    return {
        "kind": "eveos_modular_summary",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "counts": {
            "bookmarks": len(bookmarks),
            "libraryEntries": library_entry_count,
            "connections": len(connections),
            "workspaces": len(workspace_counts),
            "cards": len(category_counts)
        },
        "breakdown": {
            "bookmarksByWorkspace": workspace_counts,
            "bookmarksByCard": category_counts,
            "libraryByStatus": status_counts,
            "libraryByDataType": type_counts
        },
        "samples": {
            "bookmarks": bookmark_samples,
            "libraryEntries": library_samples
        }
    }


def build_gemini_context(mode="summary", sample_limit=25):
    state = read_modular_state()
    mode_value = str(mode or "summary").strip().lower()
    limit_value = max(5, min(200, _to_number(sample_limit, 25)))

    if mode_value == "full":
        payload = state
        header = (
            "[SYSTEM CONTEXT: EveOS modular state snapshot follows as JSON. "
            "Use it as reference context. Do not fabricate fields that are absent.]"
        )
    else:
        payload = _build_gemini_summary(state, sample_limit=limit_value)
        header = (
            "[SYSTEM CONTEXT: EveOS modular state summary follows as JSON. "
            "Use it as reference context and prioritize explicit values.]"
        )

    payload_json = json.dumps(payload, ensure_ascii=False, indent=2)
    context_text = f"{header}\n{payload_json}"
    return {
        "mode": mode_value,
        "payload": payload,
        "contextText": context_text
    }


def write_modular_state(state):
    if not isinstance(state, dict):
        raise ValueError("State payload must be a JSON object.")

    bookmarks = state.get("bookmarks") or {}
    library = state.get("library") or {}
    config = bookmarks.get("config") or {}
    links = list(bookmarks.get("links") or [])
    connections = list(library.get("connections") or [])
    categories = library.get("categories") or {}

    _ensure_clean_store()

    workspaces = _build_workspaces(config)
    workspace_map = _prepare_workspace_map(links, workspaces)
    library_index = _build_library_index(categories)

    # Connection index by link id.
    connections_by_link = {}
    connected_entry_ids = set()
    for conn in connections:
        link_id = str((conn or {}).get("linkId") or "").strip()
        if not link_id:
            continue
        connections_by_link[link_id] = dict(conn)
        entry_id = _connection_entry_id(conn or {})
        if entry_id:
            connected_entry_ids.add(str(entry_id))

    store_meta = {
        "format": "eveos.modular-state.v1",
        "version": FORMAT_VERSION,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "activeWorkspace": config.get("activeWorkspace") or "main",
        "workspaces": workspaces
    }

    (META_DIR / "store.json").write_text(
        json.dumps(store_meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (META_DIR / "config.json").write_text(
        json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    bookmark_count = 0
    tab_count = 0
    card_count = 0

    for workspace_id, ws_data in workspace_map.items():
        ws_meta = ws_data["meta"]
        workspace_folder = TABS_DIR / _folder_name(
            f"{workspace_id}-{ws_meta.get('name', workspace_id)}", workspace_id
        )
        cards_root = workspace_folder / "cards"
        cards_root.mkdir(parents=True, exist_ok=True)

        tab_payload = {
            "schema": "eveos.tab.v1",
            "id": workspace_id,
            "name": ws_meta.get("name") or workspace_id,
            "icon": ws_meta.get("icon") or "📁",
            "bookmarkCount": len(ws_data["links"]),
            "cardCount": len(ws_data["categories"])
        }
        (workspace_folder / "tab.json").write_text(
            json.dumps(tab_payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        tab_count += 1

        for category_name, category_links in ws_data["categories"].items():
            card_folder_name = _folder_name(category_name, "card")
            card_folder = cards_root / card_folder_name
            card_folder.mkdir(parents=True, exist_ok=True)

            # Keep bookmark records in a stable inner folder to avoid repeated
            # path segments like cards/start--xxxx/start--xxxx.
            bookmark_folder_name = "entries"
            bookmark_folder = card_folder / bookmark_folder_name
            bookmark_folder.mkdir(parents=True, exist_ok=True)

            scoped = _scoped_key(workspace_id, category_name)
            scoped_library = library_index.get(scoped, {})
            data_type = scoped_library.get("data_type") or "graphicNovels"

            card_payload = {
                "schema": "eveos.card.v1",
                "workspaceId": workspace_id,
                "categoryName": category_name,
                "dataType": data_type,
                "bookmarkFolder": bookmark_folder_name,
                "bookmarkCount": len(category_links)
            }
            (card_folder / "card.json").write_text(
                json.dumps(card_payload, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            card_count += 1

            # Track linked entries for this card.
            used_entry_ids = set()

            for link in category_links:
                link_id = str(link.get("id") or "").strip()
                conn = connections_by_link.get(link_id)
                linked_entry = None
                linked = False

                if conn:
                    entry_id = str(_connection_entry_id(conn) or "").strip()
                    if entry_id:
                        used_entry_ids.add(entry_id)
                        linked_entry = (scoped_library.get("entries") or {}).get(entry_id)
                        if not linked_entry:
                            # Fallback search across all scoped categories.
                            for candidate in library_index.values():
                                entry_map = candidate.get("entries") or {}
                                if entry_id in entry_map:
                                    linked_entry = entry_map[entry_id]
                                    break
                        linked = linked_entry is not None

                bookmark_payload = {
                    "schema": "eveos.bookmark.v1",
                    "bookmark": link,
                    "library": {
                        "linked": linked,
                        "connection": conn or None,
                        "entry": linked_entry or None
                    }
                }
                bookmark_file = _safe_filename(f"{link.get('id')}.json", "bookmark.json")
                (bookmark_folder / bookmark_file).write_text(
                    json.dumps(bookmark_payload, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                bookmark_count += 1

            # Keep category library entries that are not tied to bookmark connections.
            unlinked_entries = []
            for entry_id, entry in (scoped_library.get("entries") or {}).items():
                if entry_id in used_entry_ids or entry_id in connected_entry_ids:
                    continue
                unlinked_entries.append(entry)

            if unlinked_entries:
                unlinked_payload = {
                    "schema": "eveos.card-library-unlinked.v1",
                    "workspaceId": workspace_id,
                    "categoryName": category_name,
                    "entries": unlinked_entries
                }
                (card_folder / "_library-unlinked.json").write_text(
                    json.dumps(unlinked_payload, ensure_ascii=False, indent=2), encoding="utf-8"
                )

    status = _collect_status()
    return {
        "ok": True,
        "summary": {
            "tabs": tab_count,
            "cards": card_count,
            "bookmarks": bookmark_count
        },
        "status": status
    }


def read_modular_state():
    if not STORE_ROOT.exists():
        raise FileNotFoundError(f"Modular state store not found at: {STORE_ROOT}")

    store_meta = {}
    config = {}
    store_file = META_DIR / "store.json"
    config_file = META_DIR / "config.json"

    if store_file.exists():
        store_meta = json.loads(store_file.read_text(encoding="utf-8"))
    if config_file.exists():
        config = json.loads(config_file.read_text(encoding="utf-8"))

    links = []
    connections_by_link = {}
    categories = {}
    workspaces = []
    seen_workspace_ids = set()

    if TABS_DIR.exists():
        for ws_folder in sorted(TABS_DIR.iterdir()):
            if not ws_folder.is_dir():
                continue

            tab_file = ws_folder / "tab.json"
            tab_data = {}
            if tab_file.exists():
                try:
                    tab_data = json.loads(tab_file.read_text(encoding="utf-8"))
                except Exception:
                    tab_data = {}

            workspace_id = str(tab_data.get("id") or "").strip() or ws_folder.name
            workspace_name = tab_data.get("name") or workspace_id
            workspace_icon = tab_data.get("icon") or "📁"

            if workspace_id not in seen_workspace_ids:
                seen_workspace_ids.add(workspace_id)
                workspaces.append({
                    "id": workspace_id,
                    "name": workspace_name,
                    "icon": workspace_icon
                })

            cards_root = ws_folder / "cards"
            if not cards_root.exists():
                continue

            for card_folder in sorted(cards_root.iterdir()):
                if not card_folder.is_dir():
                    continue

                card_file = card_folder / "card.json"
                card_data = {}
                if card_file.exists():
                    try:
                        card_data = json.loads(card_file.read_text(encoding="utf-8"))
                    except Exception:
                        card_data = {}

                category_name = str(card_data.get("categoryName") or "").strip() or card_folder.name
                data_type = card_data.get("dataType") or "graphicNovels"
                bookmark_folder_name = card_data.get("bookmarkFolder") or card_folder.name
                bookmark_folder = card_folder / bookmark_folder_name
                if not bookmark_folder.exists():
                    bookmark_folder = card_folder

                scoped = _scoped_key(workspace_id, category_name)
                if scoped not in categories:
                    categories[scoped] = {"entries": [], "dataType": data_type}
                else:
                    categories[scoped]["dataType"] = categories[scoped].get("dataType") or data_type

                entry_ids_for_scope = {str((e or {}).get("id") or "") for e in categories[scoped]["entries"]}

                for bookmark_file in sorted(bookmark_folder.glob("*.json")):
                    if bookmark_file.name.startswith("_"):
                        continue
                    try:
                        payload = json.loads(bookmark_file.read_text(encoding="utf-8"))
                    except Exception:
                        logger.warning("Skipping invalid bookmark file: %s", bookmark_file)
                        continue

                    bookmark = payload.get("bookmark") if isinstance(payload, dict) else None
                    if not isinstance(bookmark, dict):
                        # Backward compatibility: allow bookmark JSON directly.
                        bookmark = payload if isinstance(payload, dict) else {}

                    link_id = str(bookmark.get("id") or "").strip()
                    if not link_id:
                        continue

                    bookmark["workspace"] = workspace_id
                    bookmark["category"] = category_name
                    links.append(bookmark)

                    library_payload = payload.get("library") if isinstance(payload, dict) else None
                    if not isinstance(library_payload, dict):
                        continue

                    connection = library_payload.get("connection")
                    entry = library_payload.get("entry")
                    linked = bool(library_payload.get("linked"))

                    if linked and isinstance(connection, dict) and isinstance(entry, dict):
                        normalized_connection = dict(connection)
                        normalized_connection["linkId"] = link_id
                        normalized_connection["workspace"] = workspace_id
                        normalized_connection["categoryName"] = category_name
                        if not normalized_connection.get("libraryEntryId") and entry.get("id"):
                            normalized_connection["libraryEntryId"] = entry.get("id")
                        connections_by_link[link_id] = normalized_connection

                        entry_id = str(entry.get("id") or "").strip()
                        if entry_id and entry_id not in entry_ids_for_scope:
                            categories[scoped]["entries"].append(entry)
                            entry_ids_for_scope.add(entry_id)

                unlinked_file = card_folder / "_library-unlinked.json"
                if unlinked_file.exists():
                    try:
                        unlinked_payload = json.loads(unlinked_file.read_text(encoding="utf-8"))
                        unlinked_entries = unlinked_payload.get("entries") or []
                        for entry in unlinked_entries:
                            entry_id = str((entry or {}).get("id") or "").strip()
                            if not entry_id or entry_id in entry_ids_for_scope:
                                continue
                            categories[scoped]["entries"].append(entry)
                            entry_ids_for_scope.add(entry_id)
                    except Exception:
                        logger.warning("Skipping invalid unlinked library file: %s", unlinked_file)

    if not workspaces:
        workspaces = [{"id": "main", "name": "Main", "icon": "🏠"}]

    merged_config = dict(config or {})
    merged_config["workspaces"] = workspaces
    merged_config["activeWorkspace"] = (
        merged_config.get("activeWorkspace")
        or store_meta.get("activeWorkspace")
        or workspaces[0]["id"]
    )

    unified = {
        "metadata": {
            "version": FORMAT_VERSION,
            "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "generator": "EveOS Modular State Loader",
            "source": "modular-state"
        },
        "bookmarks": {
            "links": links,
            "config": merged_config
        },
        "library": {
            "categories": categories,
            "connections": list(connections_by_link.values())
        }
    }
    return unified


def handle_get_request(handler, path, query):
    if path == "/api/eve-state/modular/status":
        status = _collect_status()
        _send_json(handler, HTTPStatus.OK, {"ok": True, **status})
        return True

    if path == "/api/eve-state/modular/load":
        try:
            unified = read_modular_state()
            status = _collect_status()
            _send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "state": unified,
                "status": status
            })
        except FileNotFoundError:
            _send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "state": None,
                "status": _collect_status()
            })
        except Exception as exc:
            logger.exception("Failed to load modular state")
            _send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
                "ok": False,
                "error": f"Failed to load modular state: {exc}"
            })
        return True

    if path == "/api/eve-state/modular/gemini-context":
        try:
            mode = (query.get("mode") or ["summary"])[0]
            sample_limit = (query.get("limit") or [25])[0]
            context = build_gemini_context(mode=mode, sample_limit=sample_limit)
            _send_json(handler, HTTPStatus.OK, {
                "ok": True,
                "mode": context["mode"],
                "contextText": context["contextText"],
                "payload": context["payload"]
            })
        except FileNotFoundError:
            _send_json(handler, HTTPStatus.OK, {
                "ok": False,
                "error": "Modular state store not found."
            })
        except Exception as exc:
            logger.exception("Failed to build Gemini context from modular state")
            _send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
                "ok": False,
                "error": f"Failed to build Gemini context: {exc}"
            })
        return True

    return False


def handle_post_request(handler, path):
    if path != "/api/eve-state/modular/save":
        return False

    payload, error = _read_request_json(handler)
    if error:
        _send_json(handler, HTTPStatus.BAD_REQUEST, {"ok": False, "error": error})
        return True

    if not isinstance(payload, dict) or "bookmarks" not in payload:
        _send_json(handler, HTTPStatus.BAD_REQUEST, {
            "ok": False,
            "error": "Expected unified state JSON payload."
        })
        return True

    try:
        result = write_modular_state(payload)
        _send_json(handler, HTTPStatus.OK, {
            "ok": True,
            "summary": result.get("summary") or {},
            "status": result.get("status") or _collect_status()
        })
    except Exception as exc:
        logger.exception("Failed to save modular state")
        _send_json(handler, HTTPStatus.INTERNAL_SERVER_ERROR, {
            "ok": False,
            "error": f"Failed to save modular state: {exc}"
        })
    return True
