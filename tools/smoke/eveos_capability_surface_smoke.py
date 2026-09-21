#!/usr/bin/env python3
"""Passive state-contract coverage for EveOS lifecycle tools and embedded capabilities."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules import (  # noqa: E402
    bookmark_intel_control,
    eveos_ports,
    eveos_web_control,
    gemini_control,
    local_moe_control,
    nexus_browser_control,
    piano_player_control,
    watchfusion_control,
    world_book_control,
)

ALLOWED_STATES = {"running", "starting", "blocked", "stopped", "conflict"}

TOOLS = {
    "web": {
        "status": eveos_web_control.get_status,
        "ports": {"port": "EVEOS_WEB_PORT"},
        "required": {"installed", "desiredRunning", "pids"},
    },
    "gemini": {
        "status": gemini_control.get_status,
        "ports": {"websocketPort": "GEMINI_WS_PORT", "statusPort": "GEMINI_STATUS_PORT"},
        "required": {
            "websocketReady", "statusReady", "statusPortOpen",
            "websocketPortOpen", "portConflict", "pids",
        },
    },
    "worldBook": {
        "status": world_book_control.get_status,
        "ports": {"port": "WORLD_BOOK_PORT"},
        "required": {"installed", "desiredRunning", "appVersion", "pids"},
    },
    "piano": {
        "status": piano_player_control.get_status,
        "ports": {"port": "PIANO_PLAYER_PORT"},
        "required": {
            "installed", "desiredRunning", "appVersion", "pids",
            "setupAvailable", "youtubeSetup", "hifiSetup",
        },
    },
    "watchFusion": {
        "status": watchfusion_control.get_status,
        "ports": {"port": "WATCHFUSION_PORT"},
        "required": {
            "installed", "nodeReady", "npmReady", "dependenciesReady",
            "setupRequired", "setupAvailable", "components", "rooms", "pids", "onDemand",
        },
    },
    "bookmarkIntel": {
        "status": bookmark_intel_control.get_status,
        "ports": {"port": "BOOKMARK_INTEL_PORT"},
        "required": {"installed", "desiredRunning", "appVersion", "pids"},
    },
    "localMoe": {
        "status": local_moe_control.get_status,
        "ports": {"port": "LOCAL_MOE_HARNESS_PORT", "runtimePort": "FREETOKEN_PORT"},
        "required": {
            "installed", "setupReady", "owned", "explicitStartRequired",
            "runtimeReady", "runtimeReachable", "runtimeHealth",
            "activeModel", "activeProfile", "system", "gpuCoexistence",
        },
    },
    "nexusBrowser": {
        "status": nexus_browser_control.get_status,
        "ports": {"port": "NEXUS_BROWSER_PORT"},
        "required": {
            "installed", "nodeReady", "npmReady", "dependenciesReady",
            "setupRequired", "setupAvailable", "extensionReady",
            "extensionConnected", "dexUiConnected", "onlineTargets",
            "localTargets", "dexRooms", "extensionSessions", "owned", "onDemand",
        },
    },
}

EMBEDDED_CAPABILITIES = {
    "wikipedia": ("/api/wikipedia/search", ROOT / "server_modules" / "wikipedia.py"),
    "proxy": ("/api/proxy", ROOT / "server_modules" / "proxy.py"),
    "lightpanda": ("/api/lightpanda", ROOT / "server_modules" / "lightpanda.py"),
    "popupView": ("/api/popup-view", ROOT / "server_modules" / "popup_viewer.py"),
    "popupResource": ("/api/popup-resource", ROOT / "server_modules" / "popup_viewer.py"),
    "eveState": ("/api/eve-state/modular/", ROOT / "server_modules" / "eve_state_store.py"),
    "geminiCredentials": ("/api/gemini-credentials/status", ROOT / "server_modules" / "gemini_credentials.py"),
    "audioflix": ("/api/audioflix/", ROOT / "server_modules" / "audioflix_bridge.py"),
}

BRIDGE_CAPABILITIES = {
    "lightpanda": ("LIGHTPANDA_BRIDGE_PORT", ROOT / "server_modules" / "lightpanda.py"),
    "camofox": ("CAMOFOX_BRIDGE_PORT", ROOT / "server_modules" / "camofox.py"),
    "wikimedia": ("WIKIMEDIA_BRIDGE_PORT", ROOT / "server_modules" / "wikipedia.py"),
    "popup": ("POPUP_BRIDGE_PORT", ROOT / "server_modules" / "popup_viewer.py"),
}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def bool_field(payload, key, name):
    require(isinstance(payload.get(key), bool), f"{name}.{key} must be boolean")


def normalized_status(name, payload):
    require(isinstance(payload, dict), f"{name} status must be an object")
    for key in ("ok", "controllerAvailable", "state", "running", "message"):
        require(key in payload, f"{name} status missing {key}")
    bool_field(payload, "ok", name)
    require(payload["controllerAvailable"] is True, f"{name} controllerAvailable must be true")
    bool_field(payload, "running", name)
    require(payload["state"] in ALLOWED_STATES, f"{name} returned unknown state: {payload['state']!r}")
    require(bool(str(payload["message"]).strip()), f"{name} status message is empty")
    require((payload["state"] == "running") == payload["running"],
            f"{name} running/state disagree: {payload['state']} vs {payload['running']}")

    spec = TOOLS[name]
    missing = sorted(key for key in spec["required"] if key not in payload)
    require(not missing, f"{name} status missing tool signals: {missing}")
    for field, port_key in spec["ports"].items():
        expected = eveos_ports.registered_port(port_key)
        require(payload.get(field) == expected,
                f"{name}.{field} drifted from {port_key}: {payload.get(field)!r} != {expected}")

    summary = {
        "state": payload["state"],
        "running": payload["running"],
        "ok": payload["ok"],
        "ports": {field: payload.get(field) for field in spec["ports"]},
    }
    for key in (
        "installed", "owned", "desiredRunning", "setupReady", "setupRequired",
        "dependenciesReady", "runtimeReady", "runtimeReachable", "runtimeHealth",
        "websocketReady", "statusReady", "portConflict", "extensionReady",
        "extensionConnected", "dexUiConnected", "onlineTargets", "localTargets",
        "dexRooms", "onDemand", "rooms", "activeProfile",
    ):
        if key in payload:
            summary[key] = payload[key]
    if isinstance(payload.get("activeModel"), dict):
        summary["activeModel"] = payload["activeModel"].get("id") or ""
    if isinstance(payload.get("extensionSessions"), dict):
        summary["extensionSessions"] = payload["extensionSessions"]
    if isinstance(payload.get("components"), dict):
        summary["components"] = {
            key: {
                "installed": bool(value.get("installed")),
                "ready": value.get("ready"),
                "liveVerified": value.get("liveVerified"),
            }
            for key, value in payload["components"].items()
            if isinstance(value, dict)
        }
    return summary


def main():
    tool_states = {}
    for name, spec in TOOLS.items():
        tool_states[name] = normalized_status(name, spec["status"]())

    server_source = (ROOT / "server" / "python-server.py").read_text(encoding="utf-8")
    embedded = {}
    for name, (route, module_path) in EMBEDDED_CAPABILITIES.items():
        require(route in server_source, f"embedded capability route missing: {name} {route}")
        require(module_path.is_file(), f"embedded capability module missing: {module_path}")
        embedded[name] = {"route": route, "module": module_path.name}

    bridges = {}
    for name, (port_key, module_path) in BRIDGE_CAPABILITIES.items():
        require(module_path.is_file(), f"bridge capability module missing: {module_path}")
        bridges[name] = {
            "port": eveos_ports.registered_port(port_key),
            "module": module_path.name,
        }

    control_source = (ROOT / "server_modules" / "eveos_control_helper.py").read_text(encoding="utf-8")
    for endpoint in (
        "/api/eveos-server/status", "/api/gemini-server/status", "/api/world-book/status",
        "/api/piano-player/status", "/api/watchfusion/status", "/api/bookmark-intel/status",
        "/api/local-moe/status", "/api/nexus-browser/status",
    ):
        require(endpoint in control_source, f"lifecycle status endpoint missing from Local Control: {endpoint}")

    print("EVEOS_CAPABILITY_SURFACE_SMOKE_OK " + json.dumps({
        "tools": tool_states,
        "embedded": embedded,
        "bridges": bridges,
    }, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
