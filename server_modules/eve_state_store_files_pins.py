from server_modules.eve_state_store_files_shared import short_hash


def normalize_click_behavior_mode(value):
    normalized = str(value or "").strip().lower()
    return normalized if normalized in {
        "inherit",
        "invert",
        "focus_only",
        "open_and_focus",
        "open_only",
    } else "inherit"


def normalize_task_mode(value):
    normalized = str(value or "").strip().lower()
    return normalized if normalized in {
        "inherit",
        "task",
        "non_task",
    } else "inherit"


def normalize_quick_pin_scope(value, target_type="bookmark"):
    normalized = str(value or "").strip().lower()
    valid = {"workspace", "tab", "card", "folder"}
    if normalized in valid:
        return normalized
    return "tab" if str(target_type or "").strip().lower() == "bookmark" else "workspace"


def normalize_quick_pin(pin, fallback_order=0):
    item = dict(pin or {})
    target_type = str(item.get("targetType") or "").strip().lower()
    if target_type not in {"bookmark", "card", "folder"}:
        return None
    target_id = str(item.get("targetId") or item.get("linkId") or item.get("id") or "").strip()
    if not target_id:
        return None
    try:
        order = int(item.get("order") if item.get("order") is not None else fallback_order)
    except Exception:
        order = int(fallback_order or 0)
    pin_id = str(item.get("id") or "").strip() or f"pin-{target_type}-{short_hash(f'{target_type}::{target_id}', 10)}"
    return {
        "id": pin_id,
        "targetType": target_type,
        "targetId": target_id,
        "scopeType": normalize_quick_pin_scope(item.get("scopeType"), target_type=target_type),
        "order": order,
    }


def derive_quick_pins_from_links(links):
    derived = []
    seen = set()
    for index, link in enumerate(links or []):
        item = dict(link or {})
        if not item.get("pinned"):
            continue
        link_id = str(item.get("id") or "").strip()
        if not link_id:
            continue
        dedupe_key = f"bookmark::{link_id}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        derived.append({
            "id": f"pin-bookmark-{link_id}",
            "targetType": "bookmark",
            "targetId": link_id,
            "scopeType": "tab",
            "order": index,
        })
    return derived


def normalize_quick_pins(pins, links=None):
    normalized = []
    seen = set()
    source_pins = pins if pins is not None else derive_quick_pins_from_links(links or [])
    for index, raw_pin in enumerate(source_pins or []):
        pin = normalize_quick_pin(raw_pin, fallback_order=index)
        if not pin:
            continue
        dedupe_key = f"{pin['targetType']}::{pin['targetId']}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalized.append(pin)
    normalized.sort(key=lambda item: (int(item.get("order") or 0), str(item.get("id") or "")))
    for index, pin in enumerate(normalized):
        pin["order"] = index
    return normalized
