"""Private, versioned Agent Nexus transfer with a stopped-runtime apply boundary."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

from server_modules import agent_management_store as agents, nexus_browser_control, tlo_definition


ROOT = Path(__file__).resolve().parent.parent
NEXUS_PATH = ROOT / "data" / "runtime" / "nexus-browser" / "dex-state.json"
BACKUP_ROOT = ROOT / "data" / "runtime" / "agent-management" / "import-backups"
SCHEMA = "eveos.agent-nexus-portable"
VERSION = 1
MAX_BYTES = 16 * 1024 * 1024
MAX_ROOMS = 500
MAX_MESSAGES = 50000
_LOCK = threading.RLock()


class PortabilityError(ValueError):
    """A transfer is invalid or would mutate live/conflicting state."""


def _text(value, field, maximum=16000, required=False):
    if value is None and not required:
        value = ""
    if not isinstance(value, str):
        raise PortabilityError(f"{field} must be text")
    if len(value) > maximum or (required and not value.strip()) or "\x00" in value:
        raise PortabilityError(f"{field} is invalid or too long")
    return value


def _record(value, fields, label):
    if not isinstance(value, dict):
        raise PortabilityError(f"{label} must be an object")
    return {key: value[key] for key in fields if key in value}


def _room(value, index):
    room = _record(value, ("id", "name", "userName", "members", "messages", "settings", "createdAt", "updatedAt"), f"room[{index}]")
    room["id"] = _text(room.get("id"), f"room[{index}].id", 120, True)
    room["name"] = _text(room.get("name"), f"room[{index}].name", 200, True)
    room["userName"] = _text(room.get("userName", "User"), f"room[{index}].userName", 100)
    members = room.get("members", [])
    messages = room.get("messages", [])
    if not isinstance(members, list) or len(members) > 128 or not isinstance(messages, list):
        raise PortabilityError(f"room[{index}] has invalid members or messages")
    safe_members = []
    for member_index, member in enumerate(members):
        item = _record(member, ("id", "name", "relayEnabled", "binding"), "member")
        item["id"] = _text(item.get("id"), "member.id", 120, True)
        item["name"] = _text(item.get("name"), "member.name", 120, True)
        item["relayEnabled"] = bool(item.get("relayEnabled", True))
        binding = _record(item.get("binding") or {}, ("targetClassId", "providerId", "providerName", "url", "title"), "binding")
        for key, content in binding.items():
            binding[key] = _text(content, f"binding.{key}", 2000)
        item["binding"] = binding
        safe_members.append(item)
    if len({member["id"] for member in safe_members}) != len(safe_members):
        raise PortabilityError(f"room[{index}] has duplicate member IDs")
    safe_messages = []
    for message in messages:
        item = _record(message, ("id", "senderKind", "senderId", "senderName", "text", "at"), "message")
        for key, limit in (("id", 120), ("senderKind", 60), ("senderId", 120), ("senderName", 120), ("text", 100000), ("at", 60)):
            item[key] = _text(item.get(key), f"message.{key}", limit, key in {"id", "text"})
        safe_messages.append(item)
    if len({message["id"] for message in safe_messages}) != len(safe_messages):
        raise PortabilityError(f"room[{index}] has duplicate message IDs")
    settings = _record(room.get("settings") or {}, ("autoRelay", "maxTurns", "contextMessages"), "settings")
    for key, lower, upper in (("maxTurns", 1, 500), ("contextMessages", 2, 20)):
        if key in settings and (not isinstance(settings[key], int) or not lower <= settings[key] <= upper):
            raise PortabilityError(f"settings.{key} is invalid")
    if "autoRelay" in settings and not isinstance(settings["autoRelay"], bool):
        raise PortabilityError("settings.autoRelay must be boolean")
    room["members"], room["messages"], room["settings"] = safe_members, safe_messages, settings
    room["relay"] = {"active": False, "remaining": 0, "waitingFor": None, "lastStopReason": "Portable import; reconnect participants"}
    for key in ("createdAt", "updatedAt"):
        room[key] = _text(room.get(key, ""), f"room.{key}", 60)
    return room


def _safe_agent(value):
    clean = _record(value, ("id", "displayName", "role", "identity", "workingRules", "providerBinding", "allowedTools", "scopes"), "agent")
    clean["permissions"] = []
    clean["privateNotes"] = []
    provider = _record(clean.get("providerBinding") or {}, ("provider", "modelId", "profile"), "providerBinding")
    provider["modelId"] = ""  # Model IDs are hardware-specific; selection is local.
    clean["providerBinding"] = provider
    if clean.get("id") == "tlo":
        default_tlo = agents.default_store()["agents"][0]
        clean["identity"] = default_tlo["identity"]  # AGENT.md, not JSON, owns TLO behavior.
        clean["workingRules"] = []
    clean["provenance"] = {"source": "local-user", "updatedAt": "1970-01-01T00:00:00Z"}
    try:
        return agents.normalize_agent(clean)
    except agents.AgentStoreError as exc:
        raise PortabilityError(str(exc)) from exc


def normalize_bundle(value):
    if not isinstance(value, dict) or value.get("schema") != SCHEMA or value.get("schemaVersion") != VERSION:
        raise PortabilityError(f"Expected {SCHEMA} v{VERSION}")
    agent_values, room_values = value.get("agents"), value.get("rooms")
    if not isinstance(agent_values, list) or len(agent_values) > agents.MAX_AGENTS:
        raise PortabilityError("Invalid agent collection")
    if not isinstance(room_values, list) or len(room_values) > MAX_ROOMS:
        raise PortabilityError("Invalid room collection")
    normalized_agents = [_safe_agent(item) for item in agent_values]
    normalized_rooms = [_room(item, index) for index, item in enumerate(room_values)]
    if sum(len(room["messages"]) for room in normalized_rooms) > MAX_MESSAGES:
        raise PortabilityError("Too many messages")
    for label, values in (("agent", normalized_agents), ("room", normalized_rooms)):
        ids = [item["id"] for item in values]
        if len(ids) != len(set(ids)):
            raise PortabilityError(f"Duplicate {label} IDs")
    definition = tlo_definition.validate(value.get("tloDefinition"))
    normalized = {"schema": SCHEMA, "schemaVersion": VERSION, "agents": normalized_agents,
                  "rooms": normalized_rooms, "tloDefinition": definition}
    if len(json.dumps(normalized, ensure_ascii=False).encode("utf-8")) > MAX_BYTES:
        raise PortabilityError("Portable bundle exceeds size limit")
    return normalized


def _require_stopped():
    status = nexus_browser_control.get_status()
    if status.get("state") != "stopped":
        raise PortabilityError("Stop Nexus Browser explicitly before transferring rooms; no running or foreign listener may own its state")


def _current_rooms():
    if not NEXUS_PATH.exists():
        return []
    try:
        payload = json.loads(NEXUS_PATH.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise PortabilityError("Current Nexus room state cannot be read safely") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("rooms"), list):
        raise PortabilityError("Current Nexus room state is invalid")
    return [_room(item, index) for index, item in enumerate(payload["rooms"])]


def export_bundle():
    with _LOCK:
        _require_stopped()
        store, _ = agents.load_store()
        tlo = next((item for item in store["agents"] if item["id"] == "tlo"), None)
        return normalize_bundle({"schema": SCHEMA, "schemaVersion": VERSION,
                                 "agents": store["agents"], "rooms": _current_rooms(),
                                 "tloDefinition": tlo_definition.load(tlo)["text"]})


def _fingerprint(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _plan(bundle):
    clean = normalize_bundle(bundle)
    store, _ = agents.load_store()
    current_agents = {item["id"]: _safe_agent(item) for item in store["agents"]}
    current_rooms = {item["id"]: item for item in _current_rooms()}
    incoming_agents = {item["id"]: item for item in clean["agents"]}
    incoming_rooms = {item["id"]: item for item in clean["rooms"]}
    added_agents = [key for key in incoming_agents if key not in current_agents]
    added_rooms = [key for key in incoming_rooms if key not in current_rooms]
    conflicting_agents = [key for key in incoming_agents if key in current_agents and _fingerprint(incoming_agents[key]) != _fingerprint(current_agents[key])]
    conflicting_rooms = [key for key in incoming_rooms if key in current_rooms and _fingerprint(incoming_rooms[key]) != _fingerprint(current_rooms[key])]
    tlo = next((item for item in store["agents"] if item["id"] == "tlo"), None)
    current_definition = tlo_definition.load(tlo)
    definition_change = current_definition["text"] != clean["tloDefinition"]
    definition_conflict = definition_change and current_definition["source"] in {"private-file", "legacy-profile"}
    return clean, store, current_rooms, {"addedAgents": added_agents, "addedRooms": added_rooms,
        "conflictingAgents": conflicting_agents, "conflictingRooms": conflicting_rooms,
        "definitionChange": definition_change, "definitionConflict": definition_conflict,
        "incomingAgents": len(incoming_agents), "incomingRooms": len(incoming_rooms),
        "incomingMessages": sum(len(room["messages"]) for room in clean["rooms"]),
        "canApply": not (conflicting_agents or conflicting_rooms or definition_conflict)}


def preview(bundle):
    with _LOCK:
        _require_stopped()
        return _plan(bundle)[-1]


def _atomic_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix="portable-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def apply(bundle):
    with _LOCK, nexus_browser_control._LOCK, agents._STORE_LOCK:
        _require_stopped()
        clean, store, current_rooms, plan = _plan(bundle)
        if not plan["canApply"]:
            raise PortabilityError("Import has conflicting IDs or a private TLO definition; no data was changed")
        if not (plan["addedAgents"] or plan["addedRooms"] or plan["definitionChange"]):
            return {**plan, "backupPath": None}
        targets = (agents.STORE_PATH, NEXUS_PATH, tlo_definition.LIVE_PATH)
        backup = BACKUP_ROOT / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup.mkdir(parents=True, exist_ok=False)
        existed = []
        for index, path in enumerate(targets):
            present = path.exists()
            existed.append(present)
            if present:
                shutil.copy2(path, backup / f"{index}-{path.name}")
        try:
            if plan["addedAgents"]:
                store["agents"].extend(item for item in clean["agents"] if item["id"] in plan["addedAgents"])
                _atomic_json(agents.STORE_PATH, agents.normalize_store(store))
            if plan["addedRooms"]:
                current_rooms.update((item["id"], item) for item in clean["rooms"] if item["id"] in plan["addedRooms"])
                _atomic_json(NEXUS_PATH, {"version": 1, "rooms": list(current_rooms.values()),
                                          "activeRoomId": next(iter(current_rooms), None),
                                          "savedAt": datetime.now(timezone.utc).isoformat()})
            if plan["definitionChange"]:
                tlo_definition.save(clean["tloDefinition"])
        except Exception:
            for index, path in enumerate(targets):
                if existed[index]:
                    shutil.copy2(backup / f"{index}-{path.name}", path)
                elif path.exists():
                    path.unlink()
            raise
        return {**plan, "backupPath": str(backup)}
