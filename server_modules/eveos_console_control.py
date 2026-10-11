"""Status/preferences view model for EveOS Local Services console controls."""
from __future__ import annotations

import os

from . import bookmark_intel_control, eveos_console_prefs, eveos_web_control, gemini_control
from . import local_moe_control, nexus_browser_control, notes_control, piano_player_control
from . import watchfusion_control, world_book_control


def preferences() -> dict:
    prefs = eveos_console_prefs.read_all()
    return {
        "ok": True,
        "default": prefs["default"],
        "envForced": bool(str(os.environ.get("EVEOS_HEADLESS", "")).strip()),
        "keepLocalControlAfterToolStop": prefs["keepLocalControlAfterToolStop"],
        "preferencesOnly": True,
        "services": [
            {
                "key": key,
                "headless": eveos_console_prefs.headless_for(key),
                "overridden": key in prefs["services"],
            }
            for key in eveos_console_prefs.KNOWN_SERVICES
        ],
    }


def overview(web_port=None, *, control_plane_port=None) -> dict:
    prefs = eveos_console_prefs.read_all()
    services = []
    status_specs = (
        ("web", "EveOS localhost",
         (lambda: eveos_web_control.get_status()) if web_port is None
         else (lambda: eveos_web_control.get_status(port=web_port)),
         lambda status: [status.get("port")]),
        ("gemini", "Gemini Live Link", gemini_control.get_status,
         lambda status: [status.get("websocketPort"), status.get("statusPort")]),
        ("worldBook", "World Book", world_book_control.get_status,
         lambda status: [status.get("port")]),
        ("notes", "EveOS Notes", notes_control.get_status,
         lambda status: [status.get("port")]),
        ("piano", "Piano Auto Player", piano_player_control.get_status,
         lambda status: [status.get("port")]),
        ("watchFusion", "WatchFusion", watchfusion_control.get_status,
         lambda status: [status.get("port")]),
        ("bookmarkIntel", "Bookmark Intel", bookmark_intel_control.get_status,
         lambda status: [status.get("port")]),
        ("localMoe", "Local MoE Harness", local_moe_control.get_status,
         lambda status: [status.get("port"), status.get("runtimePort")]),
        ("nexusBrowser", "Nexus Browser", nexus_browser_control.get_status,
         lambda status: [status.get("port")]),
    )
    for key, label, status_fn, ports in status_specs:
        try:
            status = status_fn() or {}
        except Exception as exc:  # noqa: BLE001
            status = {"running": False, "message": f"status unavailable: {exc}"}
        services.append({
            "key": key,
            "label": label,
            "running": status.get("running") is True,
            "ports": [port for port in ports(status) if port],
            "message": status.get("message") or "",
            "headless": eveos_console_prefs.headless_for(key),
            "overridden": key in prefs["services"],
        })
    return {
        "ok": True,
        "default": prefs["default"],
        "envForced": bool(str(os.environ.get("EVEOS_HEADLESS", "")).strip()),
        "keepLocalControlAfterToolStop": prefs["keepLocalControlAfterToolStop"],
        "controlPlanePort": control_plane_port,
        "services": services,
    }
