#!/usr/bin/env python3
"""Isolated Agent Nexus portable round-trip, privacy, collision and no-op smoke."""

from __future__ import annotations

import copy
import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules import agent_management_store as agents  # noqa: E402
from server_modules import agent_portability as portable  # noqa: E402
from server_modules import nexus_browser_control, tlo_definition  # noqa: E402


def require(value, message):
    if not value:
        raise AssertionError(message)


def dummy_room():
    return {
        "id": "room-portable-test", "name": "Portable test", "userName": "Test user",
        "members": [{"id": "member-test", "name": "Test agent", "relayEnabled": True,
                     "binding": {"targetClassId": "online-origin", "targetId": 999,
                                 "providerId": "test-provider", "providerName": "Test provider"}}],
        "messages": [{"id": "message-test", "senderKind": "agent", "senderId": "member-test",
                      "senderName": "Test agent", "text": "PRIVATE_DUMMY_MESSAGE", "at": "2026-01-01T00:00:00Z"}],
        "settings": {"autoRelay": True, "maxTurns": 8, "contextMessages": 8},
        "relay": {"active": True, "waitingFor": "member-test", "remaining": 3},
        "pendingTurn": {"secret": "TRANSIENT_DUMMY_SENTINEL"},
        "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z",
    }


def dummy_agent():
    return agents.normalize_agent({"id": "portable-test", "displayName": "Portable test",
        "identity": "Portable identity", "providerBinding": {"provider": "unassigned"},
        "privateNotes": ["PRIVATE_NOTE_SENTINEL"], "permissions": ["secret-permission"],
        "scopes": [{"id": "default", "label": "Default"}]})


def run():
    with tempfile.TemporaryDirectory(prefix="eveos-portable-") as temporary:
        root = Path(temporary)
        source = root / "source"
        source.mkdir()
        source_agents = source / "agents.json"
        source_rooms = source / "dex-state.json"
        source_definition = source / "AGENT.md"
        source_agents.write_text(json.dumps({**agents.default_store(),
            "agents": [agents.default_store()["agents"][0], dummy_agent()]}), encoding="utf-8")
        source_rooms.write_text(json.dumps({"version": 1, "rooms": [dummy_room()],
            "activeRoomId": "room-portable-test", "savedAt": "2026-01-01T00:00:00Z"}), encoding="utf-8")
        source_definition.write_text("# TLO\n\nPortable definition", encoding="utf-8")
        with patch.object(nexus_browser_control, "get_status", return_value={"state": "stopped"}), \
                patch.object(agents, "STORE_PATH", source_agents), \
                patch.object(portable, "NEXUS_PATH", source_rooms), \
                patch.object(tlo_definition, "LIVE_PATH", source_definition):
            bundle = portable.export_bundle()
        encoded = json.dumps(bundle)
        for forbidden in ("PRIVATE_NOTE_SENTINEL", "secret-permission", "TRANSIENT_DUMMY_SENTINEL", '"targetId"'):
            require(forbidden not in encoded, f"Portable bundle leaked {forbidden}")
        require("PRIVATE_DUMMY_MESSAGE" in encoded and len(bundle["rooms"]) == 1,
                "Room transcript was lost during export")
        destination = root / "destination"
        destination.mkdir()
        target_agents = destination / "agents.json"
        target_rooms = destination / "dex-state.json"
        target_definition = destination / "AGENT.md"
        with patch.object(agents, "STORE_PATH", target_agents), \
                patch.object(portable, "NEXUS_PATH", target_rooms), \
                patch.object(portable, "BACKUP_ROOT", destination / "backups"), \
                patch.object(tlo_definition, "LIVE_PATH", target_definition):
            with patch.object(nexus_browser_control, "get_status", return_value={"state": "running"}):
                try:
                    portable.preview(bundle)
                    raise AssertionError("Live Nexus preview was allowed")
                except portable.PortabilityError:
                    pass
            with patch.object(nexus_browser_control, "get_status", return_value={"state": "stopped"}):
                plan = portable.preview(bundle)
                require(plan["canApply"] and plan["addedRooms"] == ["room-portable-test"],
                        "Clean import preview was incorrect")
                applied = portable.apply(bundle)
                require(applied["backupPath"] and target_rooms.exists() and target_definition.exists(),
                        "Import did not commit private state with a backup")
                require(len(agents.load_store()[0]["agents"]) == 2 and
                        json.loads(target_rooms.read_text(encoding="utf-8"))["rooms"][0]["id"] == "room-portable-test",
                        "Imported agent or room was missing")
                before = [path.read_bytes() for path in (target_agents, target_rooms, target_definition)]
                repeated = portable.apply(bundle)
                require(repeated["backupPath"] is None and
                        before == [path.read_bytes() for path in (target_agents, target_rooms, target_definition)],
                        "Repeated import was not an exact no-op")
                conflicting = copy.deepcopy(bundle)
                conflicting["rooms"][0]["messages"][0]["text"] = "Changed same-ID message"
                require(not portable.preview(conflicting)["canApply"], "Room collision was not detected")
                try:
                    portable.apply(conflicting)
                    raise AssertionError("Conflicting import mutated state")
                except portable.PortabilityError:
                    pass
                require(before == [path.read_bytes() for path in (target_agents, target_rooms, target_definition)],
                        "Rejected import changed local data")
                expanded = copy.deepcopy(bundle)
                second_agent = copy.deepcopy(expanded["agents"][1])
                second_agent["id"] = "portable-test-two"
                expanded["agents"].append(second_agent)
                second_room = copy.deepcopy(expanded["rooms"][0])
                second_room["id"] = "room-portable-test-two"
                expanded["rooms"].append(second_room)
                original_writer = portable._atomic_json
                calls = [0]

                def fail_second_write(path, value):
                    calls[0] += 1
                    if calls[0] == 2:
                        raise OSError("Synthetic second-file write failure")
                    return original_writer(path, value)

                with patch.object(portable, "_atomic_json", side_effect=fail_second_write):
                    try:
                        portable.apply(expanded)
                        raise AssertionError("Failed second write was not reported")
                    except OSError:
                        pass
                require(before == [path.read_bytes() for path in (target_agents, target_rooms, target_definition)],
                        "Partial import did not roll back all target files")
                malformed = copy.deepcopy(bundle)
                malformed["rooms"][0]["messages"].append(dict(malformed["rooms"][0]["messages"][0]))
                try:
                    portable.preview(malformed)
                    raise AssertionError("Duplicate message ID was accepted")
                except portable.PortabilityError:
                    pass
    print("AGENT_PORTABILITY_SMOKE_OK")


if __name__ == "__main__":
    run()
