#!/usr/bin/env python3
"""Deterministic scoped service reload contract; no live processes or listeners."""
from __future__ import annotations

import json
import sys
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


def run():
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

    controller = SimpleNamespace(get_status=status, _status=status,
                                 stop_server=stop, start_server=start)
    controllers = {key: controller for key in reload.SERVICE_KEYS
                   if key not in {"spotifyEngine", "localControl"}}
    spotify_prepared = {
        "ok": True, "helperWasRunning": True, "pageUrl": "http://127.0.0.1:3000/tools/audioflix/spotify-engine.html",
        "authState": "signed-in", "presentation": "hidden", "desiredVolume": 0.37,
    }
    spotify_restored = {"ok": True, "helperRestored": True, "playingCount": 0, "trackIds": [], "autoplay": False}
    with patch.object(reload, "_controllers", return_value=controllers), \
            patch("server_modules.eveos_spotify_reload.prepare_web_restart", return_value=spotify_prepared) as prepare_spotify, \
            patch("server_modules.eveos_spotify_reload.restore_helper", return_value=spotify_restored) as restore_spotify:
        result = reload.restart_service("web", web_port=3000)
        check(result["ok"] and result["serviceRestarted"], "web restart failed")
        prepare_spotify.assert_called_once_with(3000)
        restore_spotify.assert_called_once_with(3000, spotify_prepared)
        check(result.get("previousInstanceId") == "web-old" and result.get("instanceId") == "web-new",
              "web replacement did not prove fresh identity")
        check(("stop", {"persist": False, "port": 3000}) in calls,
              "web stop lost effective port or rewrote desired state")
        check(("start", {"persist": False, "port": 3000, "scoped_restart": True}) in calls,
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
    print("EVEOS_SERVICE_RELOAD_OK (scoped lifecycle, Spotify dependency, Local Control handoff, isolation)")
