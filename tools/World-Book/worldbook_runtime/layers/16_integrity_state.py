def ensure_integrity_state(state: dict) -> bool:
    changed = False
    integrity = state.setdefault("integrity", {})
    if not isinstance(integrity, dict):
        state["integrity"] = integrity = {}
        changed = True

    if integrity.get("schemaVersion") != 1:
        integrity["schemaVersion"] = 1
        changed = True

    ignored = integrity.setdefault("ignored", {})
    if not isinstance(ignored, dict):
        integrity["ignored"] = {}
        changed = True

    raw_scaffolding = integrity.setdefault("intentionalScaffoldingIds", [])
    if not isinstance(raw_scaffolding, list):
        raw_scaffolding = []
        integrity["intentionalScaffoldingIds"] = raw_scaffolding
        changed = True
    normalized = []
    seen = set()
    for raw in raw_scaffolding:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    if raw_scaffolding != normalized:
        integrity["intentionalScaffoldingIds"] = normalized
        changed = True

    preferences = integrity.setdefault("preferences", {})
    if not isinstance(preferences, dict):
        integrity["preferences"] = {}
        changed = True

    return changed
