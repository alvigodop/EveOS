# State restore and rollback helpers -----------------------------------------

def normalize_loaded_state(state: dict) -> dict:
    state.setdefault("schemaVersion", SCHEMA_VERSION)
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
    return state


def create_state_rollback(reason: str) -> dict:
    RECOVERY_ROLLBACKS_DIR.mkdir(parents=True, exist_ok=True)
    safe_reason = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(reason or "restore")).strip("-") or "restore"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = RECOVERY_ROLLBACKS_DIR / f"rollback-{stamp}-{safe_reason}-{new_id('r').split('-', 1)[1][:8]}.json"
    with LOCK:
        payload = {
            "format": "eve-os-world-book-state-rollback",
            "createdAt": now_iso(),
            "reason": reason,
            "appVersion": APP_VERSION,
            "config": json.loads(json.dumps(CONFIG)),
            "state": json.loads(json.dumps(STATE)),
        }
    atomic_write_json(path, payload)
    return {"path": str(path), "name": path.name}


def restore_active_state(incoming: dict, preserve_imports: bool = True) -> None:
    if not isinstance(incoming, dict):
        raise ValueError("Backup state is missing or invalid.")
    with LOCK:
        existing_imports = json.loads(json.dumps(STATE.get("imports", []))) if preserve_imports else []
        restored = json.loads(json.dumps(incoming))
        if preserve_imports:
            restored["imports"] = existing_imports
        normalize_loaded_state(restored)
        STATE.clear()
        STATE.update(restored)
        save_state()


def restore_worldbook_only(incoming: dict) -> None:
    if not isinstance(incoming, dict) or not isinstance(incoming.get("virtualRoot"), dict):
        raise ValueError("Backup does not contain a valid virtual World Book.")
    with LOCK:
        STATE["virtualRoot"] = json.loads(json.dumps(incoming["virtualRoot"]))
        STATE["selectedVirtualId"] = incoming.get("selectedVirtualId") or "root"
        if isinstance(incoming.get("project"), dict):
            STATE["project"] = json.loads(json.dumps(incoming["project"]))
        for key in ("tagDefinitions", "statusDefinitions"):
            if isinstance(incoming.get(key), list):
                STATE[key] = json.loads(json.dumps(incoming[key]))
        for key in ("tagAutomation", "integrations", "integrity"):
            if isinstance(incoming.get(key), dict):
                STATE[key] = json.loads(json.dumps(incoming[key]))
        incoming_ui = incoming.get("ui") if isinstance(incoming.get("ui"), dict) else {}
        STATE.setdefault("ui", {})
        if "theme" in incoming_ui:
            STATE["ui"]["theme"] = json.loads(json.dumps(incoming_ui["theme"]))
        normalize_loaded_state(STATE)
        save_state()
