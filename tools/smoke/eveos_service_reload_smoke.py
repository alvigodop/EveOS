#!/usr/bin/env python3
"""Deterministic scoped service reload/update contracts; no live processes or listeners."""
from __future__ import annotations

import json
import sys
import tempfile
import threading
import traceback
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def action_map(plan):
    return {item["component"]: item["action"] for item in plan.get("actions", [])}


def planner_contract():
    from server_modules import eveos_update_plan as updates

    old_baseline = updates._BASELINE
    old_startup = updates._STARTUP_CAPTURE
    old_owner = updates._BASELINE_OWNER
    try:
        updates._BASELINE_OWNER = True
        with tempfile.TemporaryDirectory(prefix="eveos-update-plan-") as temporary:
            root = Path(temporary)
            fixtures = {
                "EveOS.html": "<!doctype html><title>EveOS</title>",
                "js/runtime.js": "window.fixture = 1;",
                "server/python-server.py": "print('web')",
                "server_modules/eveos_control_helper.py": "CONTROL = 1",
                "server_modules/eveos_server_status.py": "WEB_STATUS = 1",
                "tools/audioflix/spotify-engine.html": "<title>Spotify engine</title>",
                "config/unknown.json": "{}",
                "docs/readme.md": "docs",
                "tests/example.js": "tests",
            }
            for relative, content in fixtures.items():
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")

            with patch.object(updates, "_root", return_value=root):
                def reset_baseline():
                    captured = updates._capture()
                    updates._STARTUP_CAPTURE = json.loads(json.dumps(captured))
                    updates._BASELINE = json.loads(json.dumps(captured))
                    updates._persist_baseline()
                    return captured

                reset_baseline()
                check(not updates.check_updates()["changed"], "clean fingerprint baseline reports changes")

                (root / "js/runtime.js").write_text("window.fixture = 2;", encoding="utf-8")
                plan = updates.check_updates()
                check(action_map(plan) == {"browser": "reloadPage"}, "browser source did not map only to page reload")

                reset_baseline()
                (root / "server_modules/eveos_control_helper.py").write_text("CONTROL = 2", encoding="utf-8")
                plan = updates.check_updates()
                check(action_map(plan) == {"localControl": "replaceControlPlane"},
                      "control-only source incorrectly required web replacement")

                reset_baseline()
                (root / "server_modules/eveos_server_status.py").write_text("WEB_STATUS = 2", encoding="utf-8")
                check(action_map(updates.check_updates()) == {"web": "restartService"},
                      "web-only status source did not map only to web")

                reset_baseline()
                (root / "tools/audioflix/spotify-engine.html").write_text("<title>Spotify engine 2</title>", encoding="utf-8")
                check(action_map(updates.check_updates()) == {"spotifyEngine": "restartSpotify"},
                      "Spotify engine source did not map to helper-only restart")

                reset_baseline()
                (root / "config/unknown.json").write_text('{"changed":true}', encoding="utf-8")
                plan = updates.check_updates()
                check(plan["reviewRequired"] and action_map(plan) == {"review": "reviewRequired"},
                      "unknown runtime mapping was silently treated as current")

                reset_baseline()
                (root / "docs/readme.md").write_text("docs changed", encoding="utf-8")
                (root / "tests/example.js").write_text("tests changed", encoding="utf-8")
                check(not updates.check_updates()["changed"], "documentation/tests triggered a runtime reload")

                reset_baseline()
                carried = json.loads(json.dumps(updates._BASELINE))
                (root / "js/runtime.js").write_text("window.fixture = 3;", encoding="utf-8")
                (root / "server_modules/eveos_control_helper.py").write_text("CONTROL = 3", encoding="utf-8")
                current = updates._capture()
                updates._STARTUP_CAPTURE = json.loads(json.dumps(current))
                updates._BASELINE = carried
                updates._persist_baseline()
                preserved = updates._load_preserved_baseline()
                check(preserved and preserved["components"] == carried["components"],
                      "scoped control replacement could not carry the prior update baseline")
                before_apply = action_map(updates.check_updates())
                check(before_apply.get("browser") == "reloadPage" and before_apply.get("localControl") == "replaceControlPlane",
                      "carried baseline lost pending browser/control actions")
                updates.mark_applied(["localControl"])
                after_apply = action_map(updates.check_updates())
                check("localControl" not in after_apply and after_apply.get("browser") == "reloadPage",
                      "applying Local Control incorrectly erased a pending browser reload")
                loaded = updates.baseline_status()
                check(loaded["componentFingerprints"]["localControl"] == current["components"]["localControl"],
                      "loaded Local Control source fingerprint was confused with the carried baseline")
    finally:
        updates._BASELINE = old_baseline
        updates._STARTUP_CAPTURE = old_startup
        updates._BASELINE_OWNER = old_owner


def source_contracts():
    ai_home = (ROOT / "js/modules/gemini/search_monitor/searchMonitorAiHome.js").read_text(encoding="utf-8")
    updates_ui = (ROOT / "js/modules/gemini/search_monitor/searchMonitorUpdates.js").read_text(encoding="utf-8")
    shared_client = (ROOT / "js/modules/core/eveos-service-reload.js").read_text(encoding="utf-8")
    manifest = (ROOT / "js/config/manifest/scripts.parts/13-gemini.js").read_text(encoding="utf-8")
    control = (ROOT / "server_modules/eveos_control_helper.py").read_text(encoding="utf-8")
    probe = (ROOT / "server_modules/eveos_control_probe.py").read_text(encoding="utf-8")
    spotify = (ROOT / "server_modules/audioflix_spotify_restart.py").read_text(encoding="utf-8")

    check("window.EveOSServiceReload" in ai_home and "window.EveServiceReload" not in ai_home,
          "Search Monitor AI Home is not using the canonical shared restart client")
    check("keepLocalControlAfterToolStop" not in ai_home,
          "Search Monitor still mutates the global Local Control lifetime preference")
    check("singleFlight" in shared_client and "checkUpdates" in shared_client and "markApplied" in shared_client,
          "shared restart client lacks duplicate suppression or update APIs")
    for text in ("Check updates", "Confirm selected restarts", "Confirm EveOS page reload",
                 "Checking", "Stopping", "Starting", "Verifying", "Ready", "Failed",
                 "waitForControlReplacement", "unsaved in-page edits"):
        check(text in updates_ui, f"Search Monitor update workflow lost required UI contract: {text}")
    check("setInterval(" not in updates_ui, "update planner introduced continuous polling")
    check("sessionStorage.setItem('eveos-lane4-browser-reload-pending'" in updates_ui
          and "browserProofHosts" in updates_ui,
          "browser reload proof does not survive delayed Search Monitor mounting")
    check(manifest.index("searchMonitorAiHome.js") < manifest.index("searchMonitorUpdates.js")
          < manifest.index("gemini-init.js"), "Search Monitor update workflow is not loaded in dependency order")
    check("--scoped-restart" in probe and "bool(args.scoped_restart)" in control
          and "if not _SCOPED_STARTUP" in control,
          "Local Control replacement can still restore unrelated stopped children")
    check("engine.transport({\"action\": \"stop\"})" in spotify
          and '"autoplayRequested": False' in spotify and '"endedManufactured": False' in spotify,
          "Spotify web-restart teardown lost explicit stop/no-autoplay/no-Ended contract")


def run():
    import subprocess
    inventory = subprocess.run(
        [sys.executable, str(ROOT / "tools/smoke/eveos_update_inventory_smoke.py")],
        capture_output=True, text=True, timeout=20,
    )
    check(inventory.returncode == 0, inventory.stderr or inventory.stdout or "source inventory regression failed")
    from server_modules import eveos_control_helper as helper
    from server_modules import eveos_service_reload as reload
    from server_modules import gemini_control

    check(isinstance(gemini_control._LOCK, type(threading.RLock())),
          "Gemini lifecycle must expose the shared re-entrant controller lock")

    calls = []
    current = {
        "ok": True, "running": True, "state": "running", "port": 3000,
        "owned": True, "pids": [101], "exposureMode": "local",
        "runtimeManagedRunning": False, "runtimeReady": False,
        "instanceId": "web-old", "sourceFingerprint": "web-source-old",
    }

    def status(**kwargs):
        calls.append(("status", kwargs))
        return dict(current)

    def stop(**kwargs):
        calls.append(("stop", kwargs))
        current.update(running=False, state="stopped", pids=[])
        return dict(current)

    def start(**kwargs):
        calls.append(("start", kwargs))
        current.update(running=True, state="running", pids=[202],
                       instanceId="web-new", sourceFingerprint="web-source-new")
        return dict(current)

    modular_root = str(ROOT / "data" / "runtime")
    controller = SimpleNamespace(get_status=status, _status=status,
                                 get_active_modular_root=lambda *_args, **_kwargs: modular_root,
                                 stop_server=stop, start_server=start)
    controllers = {key: controller for key in reload.SERVICE_KEYS
                   if key not in {"spotifyEngine", "localControl"}}
    spotify_prepared = {
        "ok": True, "helperWasRunning": True, "pageUrl": "http://127.0.0.1:3000/tools/audioflix/spotify-engine.html",
        "authState": "signed-in", "presentation": "hidden", "desiredVolume": 0.37,
    }
    spotify_restored = {"ok": True, "helperRestored": True, "playingCount": 0, "trackIds": [], "autoplay": False}
    web_plan = {"componentFingerprints": {"web": "web-source-new"}}
    with patch.object(reload, "_controllers", return_value=controllers), \
            patch("server_modules.eveos_update_plan.check_updates", return_value=web_plan), \
            patch("server_modules.eveos_spotify_reload.prepare_web_restart", return_value=spotify_prepared) as prepare_spotify, \
            patch("server_modules.eveos_spotify_reload.restore_helper", return_value=spotify_restored) as restore_spotify:
        result = reload.restart_service("web", web_port=3000)
        check(result["ok"] and result["serviceRestarted"], "web restart failed")
        prepare_spotify.assert_called_once_with(3000)
        restore_spotify.assert_called_once_with(3000, spotify_prepared)
        check(result.get("previousInstanceId") == "web-old" and result.get("instanceId") == "web-new",
              "web replacement did not prove fresh identity")
        check(result.get("sourceFingerprint") == result.get("expectedSourceFingerprint") == "web-source-new",
              "web replacement accepted a stale source fingerprint")
        check(("stop", {"persist": False, "port": 3000}) in calls,
              "web stop lost effective port or rewrote desired state")
        check(("start", {"persist": False, "port": 3000, "scoped_restart": True, "modular_root": modular_root}) in calls,
              "web start did not preserve its port or suppress unrelated boot restoration")
        check(result["previousPids"] == [101] and result["pids"] == [202],
              "restart receipt omitted before/after identity")

        regular_keys = [key for key in reload.SERVICE_KEYS if key not in {"spotifyEngine", "localControl"}]
        for key in regular_keys:
            calls.clear()
            current.update(running=False, state="stopped", owned=True, exposureMode="local")
            refused = reload.restart_service(key)
            check(not refused["ok"] and not any(c[0] in {"start", "stop"} for c in calls),
                  f"{key} restarted a stopped service")

        for state in ("blocked", "conflict", "external", "starting"):
            calls.clear()
            current.update(running=True, state=state, owned=True)
            refused = reload.restart_service("nexusBrowser")
            check(not refused["ok"] and not any(c[0] in {"start", "stop"} for c in calls),
                  f"restart touched {state} runtime")

        calls.clear()
        current.update(running=True, state="running", owned=False)
        check(not reload.restart_service("localMoe")["ok"], "unowned Harness was accepted")
        check(not any(c[0] in {"start", "stop"} for c in calls), "unowned Harness was touched")

        for key in ("worldBook", "piano", "watchFusion"):
            calls.clear()
            current.update(owned=True, exposureMode="cloudflare")
            check(not reload.restart_service(key)["ok"], f"{key} silently changed Remote mode")
            check(not any(c[0] in {"start", "stop"} for c in calls), "Remote runtime was touched")

        calls.clear()
        current.update(exposureMode="lan")
        result = reload.restart_service("watchFusion")
        check(result["ok"] and ("start", {"persist": False, "host": "0.0.0.0"}) in calls,
              "WatchFusion LAN bind was lost")

        for model_running in (False, True):
            calls.clear()
            current.update(exposureMode="local", runtimeManagedRunning=model_running)
            result = reload.restart_service("localMoe")
            check(result["ok"] and ("start", {"start_runtime": model_running}) in calls,
                  "Harness reload changed stopped/running model intent")

        calls.clear()
        current.update(running=True, state="running")
        with patch.object(controller, "stop_server", return_value={"ok": False, "running": True}):
            check(not reload.restart_service("notes")["ok"], "failed stop was accepted")
        check(not any(c[0] == "start" for c in calls), "failed stop still started replacement")

        calls.clear()
        with patch.object(controller, "stop_server", side_effect=RuntimeError("fixture stop failed")):
            check(not reload.restart_service("notes")["ok"], "stop exception escaped contract")
        check(not any(c[0] == "start" for c in calls), "stop exception still started replacement")

        calls.clear()
        with patch.object(controller, "start_server", return_value={"ok": False, "running": False}):
            result = reload.restart_service("notes")
            check(not result["ok"] and result["restartStage"] == "start", "start failure stage missing")

        with reload._LOCKS["web"]:
            check(not reload.restart_service("web")["ok"], "duplicate restart was accepted")

    selected_calls = []
    unrelated_calls = []
    selected_state = {
        "ok": True, "running": True, "state": "running", "owned": True,
        "pids": [301], "instanceId": "notes-old", "sourceFingerprint": "notes-old-source",
    }
    unrelated_state = {
        "ok": True, "running": True, "state": "running", "owned": True,
        "pids": [777], "instanceId": "world-book-stable", "sourceFingerprint": "world-book-source",
    }

    def selected_status(**kwargs):
        selected_calls.append(("status", kwargs))
        return dict(selected_state)

    def selected_stop(**kwargs):
        selected_calls.append(("stop", kwargs))
        selected_state.update(running=False, state="stopped", pids=[])
        return dict(selected_state)

    def selected_start(**kwargs):
        selected_calls.append(("start", kwargs))
        selected_state.update(running=True, state="running", pids=[302],
                              instanceId="notes-new", sourceFingerprint="notes-new-source")
        return dict(selected_state)

    def unrelated_status(**kwargs):
        unrelated_calls.append(("status", kwargs))
        return dict(unrelated_state)

    unrelated_before = json.loads(json.dumps(unrelated_state))
    isolation_controllers = {
        "notes": SimpleNamespace(get_status=selected_status, _status=selected_status,
                                 stop_server=selected_stop, start_server=selected_start),
        "worldBook": SimpleNamespace(get_status=unrelated_status, _status=unrelated_status,
                                     stop_server=lambda **kwargs: unrelated_calls.append(("stop", kwargs)),
                                     start_server=lambda **kwargs: unrelated_calls.append(("start", kwargs))),
    }
    with patch.object(reload, "_controllers", return_value=isolation_controllers):
        result = reload.restart_service("notes")
    check(result["ok"] and result["serviceRestarted"], "isolated Notes restart failed")
    check(result["previousPids"] == [301] and result["pids"] == [302],
          "selected service did not receive a fresh process identity")
    check(unrelated_state == unrelated_before,
          "restarting Notes changed unrelated World Book identity or running state")
    check(unrelated_calls == [],
          "restarting Notes probed or mutated unrelated World Book lifecycle")

    with patch("server_modules.eveos_spotify_reload.restart_helper",
               return_value={"ok": True, "serviceRestarted": True, "restartStage": "verify",
                             "helperRestored": True, "playingCount": 0, "trackIds": []}) as spotify_restart:
        result = reload.restart_service("spotifyEngine", web_port=3000)
        check(result["ok"] and result["serviceRestarted"], "Spotify-only restart failed")
        spotify_restart.assert_called_once_with(3000)

    replacement_health = {
        "ok": True, "running": True, "instanceId": "control-old", "sourceFingerprint": "control-old-source",
    }
    update_plan = {"componentFingerprints": {"localControl": "control-new-source"}}
    replacement_ack = {"ok": True, "accepted": True, "controlPlaneStopping": True, "operationId": "fixture"}
    with patch("server_modules.eveos_control_replace._health", return_value=replacement_health), \
            patch("server_modules.eveos_update_plan.check_updates", return_value=update_plan), \
            patch("server_modules.eveos_control_replace.request_replacement", return_value=replacement_ack) as replace:
        result = reload.restart_service("localControl")
        check(result["ok"] and result["controlPlaneStopping"], "Local Control handoff was not acknowledged")
        _, kwargs = replace.call_args
        check(kwargs.get("retire_current") is True, "Local Control replacement did not retire only after acknowledgement")
        check(kwargs.get("expected_source_fingerprint") == "control-new-source",
              "Local Control replacement did not verify current source")

    check(not reload.restart_service("controlPlane")["ok"], "unregistered coordinator alias was accepted")

    captured = []
    handler = SimpleNamespace(
        path="/api/services/restart", headers={}, client_address=("127.0.0.1", 1),
        server=SimpleNamespace(server_address=("127.0.0.1", 9082)),
        _send=lambda body, status=200: captured.append((body, int(status))),
    )
    with patch.object(helper.gemini_control, "request_can_control", return_value=False), \
            patch.object(helper.eveos_control_requests, "can_start_bridge_service", return_value=False), \
            patch.object(reload, "restart_service") as invoke:
        helper.EveOSControlHandler.do_POST(handler)
        check(captured[-1][1] == 403 and not invoke.called, "restart route lacked local authorization")

    with patch.object(helper.gemini_control, "request_can_control", return_value=True), \
            patch.object(helper.gemini_credentials, "read_json_body", return_value={"service": "web"}), \
            patch.object(helper, "_request_web_port", return_value=3000), \
            patch.object(reload, "restart_service", return_value={"ok": True}) as invoke, \
            patch.object(helper, "_stop_tool", side_effect=AssertionError("individual-stop wrapper")), \
            patch.object(helper, "_stop_everything", side_effect=AssertionError("global-stop wrapper")):
        helper.EveOSControlHandler.do_POST(handler)
        invoke.assert_called_once_with("web", web_port=3000)
        check(captured[-1][1] == 200, "authorized restart failed")

    planner_contract()
    source_contracts()
    from helpers.eveos_web_restart_scope_contract import run_web_scope_contract
    run_web_scope_contract()


if __name__ == "__main__":
    try:
        run()
    except Exception:
        details = traceback.format_exc()
        directory = ROOT / "data" / "runtime" / "smoke-results"
        directory.mkdir(parents=True, exist_ok=True)
        artifact = directory / "eveos-service-reload-failure.json"
        artifact.write_text(json.dumps({"test": "eveos-service-reload", "traceback": details}), encoding="utf-8")
        print("EVEOS_SERVICE_RELOAD_FAIL", file=sys.stderr)
        print("\n".join(details.splitlines()[-40:]), file=sys.stderr)
        print(f"DIAGNOSTIC {artifact}", file=sys.stderr)
        raise SystemExit(1)
    print("EVEOS_SERVICE_RELOAD_OK (lifecycle, update planning, Spotify dependency, control handoff, UI contracts)")
