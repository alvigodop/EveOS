import json
import os
import shutil
import time
from datetime import datetime
from pathlib import Path

from server_modules.eve_state_store_layers_shared import _parse_scoped_category_key, _slugify

def _normalize_quick_pin_scope(value, target_type="bookmark"):
    normalized = str(value or "").strip().lower()
    if normalized in {"workspace", "tab", "card", "folder"}:
        return normalized
    return "tab" if str(target_type or "").strip().lower() == "bookmark" else "workspace"

def _normalize_quick_pin(pin, fallback_order=0):
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
    pin_id = str(item.get("id") or "").strip() or f"pin-{target_type}-{_slugify(f'{target_type}-{target_id}', 'pin')}"
    return {
        "id": pin_id,
        "targetType": target_type,
        "targetId": target_id,
        "scopeType": _normalize_quick_pin_scope(item.get("scopeType"), target_type=target_type),
        "order": order,
    }

def _derive_quick_pins_from_links(links):
    derived = []
    for index, link in enumerate(links or []):
        link_id = str((link or {}).get("id") or "").strip()
        if not link_id or not (link or {}).get("pinned"):
            continue
        derived.append({
            "id": f"pin-bookmark-{link_id}",
            "targetType": "bookmark",
            "targetId": link_id,
            "scopeType": "tab",
            "order": index,
        })
    return derived

def _normalize_quick_pins(pins, links=None):
    normalized = []
    seen = set()
    source_pins = pins if pins is not None else _derive_quick_pins_from_links(links or [])
    for index, raw_pin in enumerate(source_pins or []):
        pin = _normalize_quick_pin(raw_pin, fallback_order=index)
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

def _pin_target_context(pin, links=None):
    item = dict(pin or {})
    target_type = str(item.get("targetType") or "").strip().lower()
    target_id = str(item.get("targetId") or "").strip()
    if target_type == "bookmark":
        for link in links or []:
            if str((link or {}).get("id") or "").strip() != target_id:
                continue
            return {
                "workspace_id": str((link or {}).get("workspace") or "main").strip() or "main",
                "category_name": str((link or {}).get("category") or "Unsorted").strip() or "Unsorted",
                "folder_id": str((link or {}).get("folderId") or "").strip(),
            }
        return None
    if target_type == "card":
        parsed = _parse_scoped_category_key(target_id)
        return {
            "workspace_id": str(parsed.get("workspace_id") or "main").strip() or "main",
            "category_name": str(parsed.get("category_name") or "Unsorted").strip() or "Unsorted",
            "folder_id": "",
        }
    if target_type == "folder":
        parts = target_id.split("::")
        return {
            "workspace_id": str(parts[0] or "main").strip() or "main",
            "category_name": str(parts[1] or "Unsorted").strip() or "Unsorted",
            "folder_id": str("::".join(parts[2:]) or "").strip(),
        }
    return None

def _pin_matches_card_scope(pin, workspace_id, category_name, links=None):
    context = _pin_target_context(pin, links=links)
    return bool(
        context
        and str(context.get("workspace_id") or "main").strip() == str(workspace_id or "main").strip()
        and str(context.get("category_name") or "Unsorted").strip() == str(category_name or "Unsorted").strip()
    )

def _pin_matches_folder_subtree(pin, workspace_id, category_name, folder_ids, links=None):
    context = _pin_target_context(pin, links=links)
    if not context:
        return False
    if str(context.get("workspace_id") or "main").strip() != str(workspace_id or "main").strip():
        return False
    if str(context.get("category_name") or "Unsorted").strip() != str(category_name or "Unsorted").strip():
        return False
    target_type = str((pin or {}).get("targetType") or "").strip().lower()
    if target_type not in {"bookmark", "folder"}:
        return False
    return str(context.get("folder_id") or "").strip() in {str(folder_id or "").strip() for folder_id in (folder_ids or set())}
