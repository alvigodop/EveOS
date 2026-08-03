# External integration state normalization -----------------------------------

INJECTION_OWNER_TAG = "Injected from Eve"
MAX_INJECTION_HISTORY = 200


def safe_nonnegative_int(value: object) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def ensure_integration_state(state: dict) -> bool:
    changed = False
    integrations = state.get("integrations")
    if not isinstance(integrations, dict):
        state["integrations"] = integrations = {}
        changed = True

    applied = integrations.get("applied")
    if not isinstance(applied, list):
        integrations["applied"] = applied = []
        changed = True

    normalized = []
    seen = set()
    for item in applied:
        if not isinstance(item, dict):
            changed = True
            continue
        injection_id = str(item.get("id") or "").strip()
        revision = item.get("revision", 1)
        try:
            revision = max(1, int(revision))
        except (TypeError, ValueError):
            revision = 1
            changed = True
        key = str(item.get("key") or (f"{injection_id}@{revision}" if injection_id else "")).strip()
        if not key or key in seen:
            changed = True
            continue
        seen.add(key)
        normalized.append({
            "key": key,
            "id": injection_id or key.split("@", 1)[0],
            "revision": revision,
            "title": str(item.get("title") or injection_id or "External integration"),
            "author": str(item.get("author") or "Eve"),
            "scope": str(item.get("scope") or "single-task"),
            "appliedAt": item.get("appliedAt") or now_iso(),
            "operationCount": safe_nonnegative_int(item.get("operationCount")),
            "changeCount": safe_nonnegative_int(item.get("changeCount")),
        })
        if len(normalized) >= MAX_INJECTION_HISTORY:
            break

    if applied != normalized:
        integrations["applied"] = normalized
        changed = True
    if integrations.get("protectedTag") != INJECTION_OWNER_TAG:
        integrations["protectedTag"] = INJECTION_OWNER_TAG
        changed = True
    return changed
