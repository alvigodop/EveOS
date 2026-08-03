def normalize_link_list(value: object) -> list[dict]:
    if not isinstance(value, list):
        return []

    normalized = []
    for item in value:
        if not isinstance(item, dict):
            continue
        target_id = str(item.get("targetId") or "").strip()
        if not target_id:
            continue
        normalized.append({
            "id": str(item.get("id") or new_id("link")),
            "targetType": "virtual",
            "targetId": target_id,
            "relationshipType": str(item.get("relationshipType") or "related-to"),
            "label": str(item.get("label") or "").strip(),
            "provenance": item.get("provenance") if isinstance(item.get("provenance"), dict) else {},
            "createdAt": item.get("createdAt") or now_iso(),
            "updatedAt": item.get("updatedAt") or item.get("createdAt") or now_iso(),
        })
    return normalized


def normalize_tags(value: object) -> list[str]:
    if isinstance(value, str):
        source = value.split(",")
    elif isinstance(value, list):
        source = value
    else:
        source = []

    result: list[str] = []
    seen: set[str] = set()
    for raw in source:
        tag = str(raw or "").strip()
        key = tag.casefold()
        if not tag or key in seen:
            continue
        seen.add(key)
        result.append(tag)
    return result


def normalize_tag_container(container: dict, is_folder: bool) -> bool:
    changed = False
    tags = normalize_tags(container.get("tags"))
    shared = normalize_tags(container.get("sharedTags")) if is_folder else []
    tag_keys = {tag.casefold() for tag in tags}
    shared = [tag for tag in shared if tag.casefold() in tag_keys]
    visible = normalize_tags(container.get("visibleTags") if "visibleTags" in container else tags)

    if container.get("tags") != tags:
        container["tags"] = tags
        changed = True
    if container.get("sharedTags") != shared:
        container["sharedTags"] = shared
        changed = True
    if container.get("visibleTags") != visible:
        container["visibleTags"] = visible
        changed = True
    return changed


def ensure_links_and_theme_state(state: dict) -> bool:
    changed = False

    file_meta = state.setdefault("fileMeta", {})
    if not isinstance(file_meta, dict):
        state["fileMeta"] = file_meta = {}
        changed = True

    for path, metadata in list(file_meta.items()):
        if not isinstance(metadata, dict):
            file_meta[path] = metadata = {}
            changed = True
        if normalize_tag_container(metadata, True):
            changed = True
        normalized = normalize_link_list(metadata.get("links"))
        if metadata.get("links") != normalized:
            metadata["links"] = normalized
            changed = True

    def walk(node: dict) -> None:
        nonlocal changed
        if not isinstance(node, dict):
            return
        if normalize_tag_container(node, node.get("type") == "folder"):
            changed = True
        normalized = normalize_link_list(node.get("links"))
        if node.get("links") != normalized:
            node["links"] = normalized
            changed = True
        for child in node.get("children") or []:
            walk(child)

    walk(state.get("virtualRoot") or {})

    automation = state.setdefault("tagAutomation", {"pathTagsEnabled": True})
    if not isinstance(automation, dict):
        state["tagAutomation"] = automation = {"pathTagsEnabled": True}
        changed = True
    if not isinstance(automation.get("pathTagsEnabled"), bool):
        automation["pathTagsEnabled"] = True
        changed = True

    ui = state.setdefault("ui", {})
    if not isinstance(ui, dict):
        state["ui"] = ui = {}
        changed = True

    raw_theme = ui.get("theme") if isinstance(ui.get("theme"), dict) else {}
    mode = str(raw_theme.get("mode") or "normal")
    if mode not in {"normal", "dark", "custom"}:
        mode = "normal"
        changed = True

    raw_custom = raw_theme.get("custom") if isinstance(raw_theme.get("custom"), dict) else {}
    custom = {}
    for key, fallback in DEFAULT_CUSTOM_THEME.items():
        value = str(raw_custom.get(key) or fallback)
        if not (len(value) == 7 and value.startswith("#")):
            value = fallback
            changed = True
        custom[key] = value

    normalized_theme = {"mode": mode, "custom": custom}
    if ui.get("theme") != normalized_theme:
        ui["theme"] = normalized_theme
        changed = True

    if ensure_integration_state(state):
        changed = True
    if ensure_integrity_state(state):
        changed = True
    ui["linksCollapsed"] = bool(ui.get("linksCollapsed", False))

    return changed


def virtual_link_details(links: object) -> list[dict]:
    details = []
    root = STATE.get("virtualRoot") or {}
    for link in normalize_link_list(links):
        target = find_virtual_node(root, link["targetId"])
        target_path = ""
        target_name = ""
        if target is not None:
            target_name = str(target.get("name") or "Untitled")
            target_path = " / ".join(
                str(item.get("name") or "Untitled")
                for item in virtual_path_records(link["targetId"])
            )
        details.append({
            **link,
            "displayLabel": link.get("label") or target_name or "Missing link",
            "targetName": target_name,
            "targetPath": target_path,
            "missing": target is None,
        })
    return details



def ensure_history_state(state: dict) -> bool:
    changed = False
    history = state.setdefault("history", {})
    if not isinstance(history, dict):
        state["history"] = history = {}
        changed = True
    deleted = history.setdefault("deleted", [])
    if not isinstance(deleted, list):
        history["deleted"] = deleted = []
        changed = True
    normalized = []
    for record in deleted[:100]:
        if not isinstance(record, dict) or not isinstance(record.get("node"), dict):
            changed = True
            continue
        record.setdefault("id", new_id("deleted"))
        record.setdefault("parentId", "root")
        record.setdefault("parentPath", "World Book Manager")
        record.setdefault("index", 0)
        record.setdefault("deletedAt", now_iso())
        normalized.append(record)
    if normalized != deleted:
        history["deleted"] = normalized
        changed = True
    return changed


def default_state() -> dict:
    timestamp = now_iso()
    return {
        "schemaVersion": SCHEMA_VERSION,
        "appVersion": APP_VERSION,
        "project": {
            "id": new_id("project"),
            "title": "World Book",
            "createdAt": timestamp,
            "updatedAt": timestamp,
        },
        "virtualRoot": default_virtual_root(),
        "selectedVirtualId": "root",
        "fileMeta": {},
        "imports": [],
        "tagDefinitions": [],
        "statusDefinitions": default_status_definitions(),
        "tagAutomation": {"pathTagsEnabled": True, "mentionTagsEnabled": True},
        "integrations": {"applied": [], "protectedTag": INJECTION_OWNER_TAG},
        "integrity": {"schemaVersion": 1, "ignored": {}, "intentionalScaffoldingIds": [], "preferences": {}},
        "history": {"deleted": []},
        "ui": {
            "sidebarWidth": 380,
            "lastPhysicalFolderPath": "",
            "lastVirtualFolderId": "root",
            "linksCollapsed": False,
            "theme": {"mode": "normal", "custom": dict(DEFAULT_CUSTOM_THEME)},
        },
    }


def default_config() -> dict:
    return {
        "rootPath": "",
        "port": 8766,
        "updatedAt": now_iso(),
    }


def load_json(path: Path, fallback: object) -> object:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"Could not load {path.name}: {exc}")
    return fallback


def load_config() -> dict:
    config = load_json(CONFIG_PATH, default_config())
    if not isinstance(config, dict):
        config = default_config()
    config.setdefault("rootPath", "")
    config.setdefault("port", 8766)
    if int(config.get("port") or 0) == 8765:
        config["port"] = 8766
    config.setdefault("updatedAt", now_iso())
    return config


def load_state() -> dict:
    state = load_json(STATE_PATH, default_state())
    if not isinstance(state, dict):
        state = default_state()
    state["schemaVersion"] = SCHEMA_VERSION
    state["appVersion"] = APP_VERSION
    state.setdefault("project", default_state()["project"])
    state.setdefault("virtualRoot", default_virtual_root())
    state.setdefault("selectedVirtualId", "root")
    state.setdefault("fileMeta", {})
    state.setdefault("imports", [])
    ensure_taxonomy_state(state)
    ensure_links_and_theme_state(state)
    state.setdefault("ui", {})
    state["ui"].setdefault("sidebarWidth", 380)
    state["ui"].setdefault("lastPhysicalFolderPath", "")
    state["ui"].setdefault("lastVirtualFolderId", "root")
    state["ui"].setdefault("linksCollapsed", False)
    ensure_integration_state(state)
    ensure_integrity_state(state)
    ensure_history_state(state)
    return state


CONFIG = load_config()
STATE = load_state()
LOCK = threading.RLock()


def save_config() -> None:
    CONFIG["updatedAt"] = now_iso()
    atomic_write_json(CONFIG_PATH, CONFIG)


def save_state() -> None:
    ensure_taxonomy_state(STATE)
    ensure_links_and_theme_state(STATE)
    ensure_history_state(STATE)
    STATE["schemaVersion"] = SCHEMA_VERSION
    STATE["appVersion"] = APP_VERSION
    STATE["project"]["updatedAt"] = now_iso()
    atomic_write_json(STATE_PATH, STATE)
