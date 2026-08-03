def default_status_definitions() -> list[dict]:
    timestamp = now_iso()
    return [
        {"id": "canon", "name": "Canon", "createdAt": timestamp, "updatedAt": timestamp},
        {"id": "draft", "name": "Draft", "createdAt": timestamp, "updatedAt": timestamp},
        {"id": "uncertain", "name": "Uncertain canon", "createdAt": timestamp, "updatedAt": timestamp},
        {"id": "recovered", "name": "Recovered", "createdAt": timestamp, "updatedAt": timestamp},
        {"id": "retired", "name": "Retired canon", "createdAt": timestamp, "updatedAt": timestamp},
    ]


def title_from_identifier(identifier: str) -> str:
    value = str(identifier or "draft").replace("_", " ").replace("-", " ").strip()
    return value[:1].upper() + value[1:] if value else "Draft"


def ensure_taxonomy_state(state: dict) -> bool:
    changed = False
    timestamp = now_iso()

    tag_definitions = state.setdefault("tagDefinitions", [])
    if not isinstance(tag_definitions, list):
        state["tagDefinitions"] = tag_definitions = []
        changed = True

    status_definitions = state.setdefault("statusDefinitions", default_status_definitions())
    if not isinstance(status_definitions, list) or not status_definitions:
        state["statusDefinitions"] = status_definitions = default_status_definitions()
        changed = True

    normalized_statuses = []
    seen_status_ids = set()
    for definition in status_definitions:
        if not isinstance(definition, dict):
            changed = True
            continue
        identifier = str(definition.get("id") or new_id("status"))
        if identifier in seen_status_ids:
            changed = True
            continue
        seen_status_ids.add(identifier)
        normalized_statuses.append({
            "id": identifier,
            "name": str(definition.get("name") or title_from_identifier(identifier)),
            "createdAt": definition.get("createdAt") or timestamp,
            "updatedAt": definition.get("updatedAt") or timestamp,
        })
    state["statusDefinitions"] = status_definitions = normalized_statuses

    seen_tag_names = {}
    normalized_tags = []
    for definition in tag_definitions:
        if isinstance(definition, str):
            name = definition.strip()
            definition = {"id": new_id("tag"), "name": name}
            changed = True
        if not isinstance(definition, dict):
            changed = True
            continue
        name = str(definition.get("name") or "").strip()
        if not name:
            changed = True
            continue
        key = name.casefold()
        if key in seen_tag_names:
            changed = True
            continue
        record = {
            "id": str(definition.get("id") or new_id("tag")),
            "name": name,
            "createdAt": definition.get("createdAt") or timestamp,
            "updatedAt": definition.get("updatedAt") or timestamp,
        }
        seen_tag_names[key] = record
        normalized_tags.append(record)
    state["tagDefinitions"] = tag_definitions = normalized_tags

    used_tags = []
    used_statuses = []
    for metadata in (state.get("fileMeta") or {}).values():
        if not isinstance(metadata, dict):
            continue
        used_tags.extend(metadata.get("tags") or [])
        used_statuses.append(str(metadata.get("status") or "draft"))

    def walk_virtual(node: dict) -> None:
        if not isinstance(node, dict):
            return
        used_tags.extend(node.get("tags") or [])
        used_statuses.append(str(node.get("status") or "draft"))
        for child in node.get("children") or []:
            walk_virtual(child)

    walk_virtual(state.get("virtualRoot") or {})

    for raw_tag in used_tags:
        name = str(raw_tag or "").strip()
        if not name:
            continue
        key = name.casefold()
        if key not in seen_tag_names:
            record = {
                "id": new_id("tag"),
                "name": name,
                "createdAt": timestamp,
                "updatedAt": timestamp,
            }
            tag_definitions.append(record)
            seen_tag_names[key] = record
            changed = True

    status_ids = {item["id"] for item in status_definitions}
    for identifier in used_statuses:
        if identifier and identifier not in status_ids:
            status_definitions.append({
                "id": identifier,
                "name": title_from_identifier(identifier),
                "createdAt": timestamp,
                "updatedAt": timestamp,
            })
            status_ids.add(identifier)
            changed = True

    return changed


def ensure_tag_definition(state: dict, name: str) -> dict | None:
    clean = str(name or "").strip()
    if not clean:
        return None
    ensure_taxonomy_state(state)
    for definition in state.get("tagDefinitions", []):
        if str(definition.get("name") or "").casefold() == clean.casefold():
            return definition
    record = {
        "id": new_id("tag"),
        "name": clean,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    state.setdefault("tagDefinitions", []).append(record)
    return record


DEFAULT_CUSTOM_THEME = {
    "background": "#f6f3ee",
    "panel": "#fffdf9",
    "sidebar": "#f1ede7",
    "text": "#282521",
    "muted": "#756f67",
    "accent": "#6d68a8",
    "accentSoft": "#ebe9f8",
    "border": "#ded8ce",
    "danger": "#a95050",
}
