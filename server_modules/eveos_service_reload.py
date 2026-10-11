"""Restart one running EveOS child through its existing identity-aware controller."""
from __future__ import annotations

import threading
from contextlib import nullcontext
from datetime import datetime, timezone

SERVICE_KEYS = ("web", "gemini", "worldBook", "notes", "piano", "watchFusion",
                "bookmarkIntel", "localMoe", "nexusBrowser", "spotifyEngine", "localControl")
_LOCKS = {key: threading.Lock() for key in SERVICE_KEYS}
_PERSISTED = {"web", "worldBook", "notes", "piano", "watchFusion", "bookmarkIntel"}


def _controllers():
    from . import bookmark_intel_control, eveos_web_control, gemini_control, local_moe_control
    from . import nexus_browser_control, notes_control, piano_player_control
    from . import watchfusion_control, world_book_control
    return {
        "web": eveos_web_control,
        "gemini": gemini_control,
        "worldBook": world_book_control,
        "notes": notes_control,
        "piano": piano_player_control,
        "watchFusion": watchfusion_control,
        "bookmarkIntel": bookmark_intel_control,
        "localMoe": local_moe_control,
        "nexusBrowser": nexus_browser_control,
    }


def _receipt(service, status=None, **fields):
    return {
        "controllerAvailable": True, "state": "error", "running": False,
        **(status or {}), "serviceKey": service, "serviceRestarted": False,
        "controlPlaneStopping": False, **fields,
    }


def _restart_spotify(web_port):
    from . import eveos_spotify_reload
    if not web_port:
        return _receipt("spotifyEngine", ok=False, restartStage="preflight",
                        message="Spotify restart requires a verified EveOS web port.")
    result = eveos_spotify_reload.restart_helper(int(web_port))
    return _receipt(
        "spotifyEngine", result,
        serviceRestarted=result.get("serviceRestarted") is True,
        restartStage=result.get("restartStage") or "verify",
    )


def _restart_local_control():
    from . import eveos_control_replace, eveos_ports, eveos_update_plan
    port = eveos_ports.service_port("GEMINI_CONTROL_PORT")
    current = eveos_control_replace._health(port)
    if not current or current.get("running") is not True:
        return _receipt("localControl", ok=False, restartStage="preflight",
                        message="Local Control replacement requires the verified running coordinator.")
    plan = eveos_update_plan.check_updates()
    expected = str(plan.get("componentFingerprints", {}).get("localControl") or "")
    accepted = eveos_control_replace.request_replacement(
        port,
        current_instance_id=str(current.get("instanceId") or ""),
        current_source_fingerprint=str(current.get("sourceFingerprint") or ""),
        expected_source_fingerprint=expected,
        retire_current=True,
    )
    return _receipt(
        "localControl", accepted,
        ok=accepted.get("ok") is True,
        restartStage="handoff" if accepted.get("ok") else "preflight",
        controlPlaneStopping=accepted.get("controlPlaneStopping") is True,
        previousInstanceId=current.get("instanceId", ""),
        expectedSourceFingerprint=expected,
        message=accepted.get("message") or "Local Control replacement could not be acknowledged.",
    )


def restart_service(service, *, web_port=None):
    """Keep saved preferences and stopped services untouched; never use Global Stop."""
    key = str(service or "")
    if key not in SERVICE_KEYS:
        return _receipt(key, ok=False, restartStage="preflight",
                        message="Choose one registered EveOS child service to restart.")
    lock = _LOCKS[key]
    if not lock.acquire(blocking=False):
        return _receipt(key, ok=False, restartStage="preflight",
                        message=f"A {key} restart is already in progress.")
    stage, before = "preflight", {}
    spotify_prepared = None
    expected_web_source = ""
    try:
        if key == "spotifyEngine":
            return _restart_spotify(web_port)
        if key == "localControl":
            return _restart_local_control()

        controller = _controllers()[key]
        # Existing controller locks also serialize their ordinary Start/Stop routes.
        with getattr(controller, "_LOCK", nullcontext()):
            status_options = {"port": web_port} if key == "web" else {}
            status_fn = controller._status if key == "localMoe" else controller.get_status
            before = status_fn(**status_options)
            conflicted = before.get("state") in {"blocked", "conflict", "external", "starting"}
            conflicted = conflicted or before.get("portConflict") is True
            conflicted = conflicted or (key in {"localMoe", "nexusBrowser"} and before.get("owned") is not True)
            if conflicted or before.get("running") is not True:
                return _receipt(key, before, ok=False, restartStage=stage,
                                message="Restart requires an already-running, verified EveOS service. Use Start for a stopped service.")

            mode = str(before.get("exposureMode") or "local")
            unsupported_mode = (key in {"worldBook", "piano"} and mode != "local")
            unsupported_mode = unsupported_mode or (key == "watchFusion" and mode not in {"local", "lan"})
            if unsupported_mode:
                return _receipt(key, before, ok=False, restartStage=stage,
                                message=f"Restart cannot preserve {key} {mode} exposure. Use its existing exposure launcher.")

            options = {"persist": False} if key in _PERSISTED else {}
            if key == "web":
                from . import eveos_spotify_reload, eveos_update_plan
                options["port"] = before.get("port") or web_port
                expected_web_source = str(
                    eveos_update_plan.check_updates().get("componentFingerprints", {}).get("web") or ""
                )
                if not expected_web_source:
                    return _receipt(key, before, ok=False, restartStage="preflight",
                                    message="Web restart could not determine the current source fingerprint.")
                stage = "spotify-prepare"
                spotify_prepared = eveos_spotify_reload.prepare_web_restart(int(options["port"]))
                if spotify_prepared.get("ok") is not True:
                    return _receipt(key, before, ok=False, restartStage=stage,
                                    spotify=spotify_prepared,
                                    expectedSourceFingerprint=expected_web_source,
                                    message=spotify_prepared.get("reason") or "Web restart stopped before Spotify ownership could be reset safely.")

            stage = "stop"
            stopped = controller.stop_server(**options)
            if stopped.get("ok") is not True or stopped.get("running") is True or stopped.get("state") in {"starting", "blocked", "conflict", "external"}:
                return _receipt(key, stopped, ok=False, restartStage=stage,
                                spotify=spotify_prepared, expectedSourceFingerprint=expected_web_source,
                                message=stopped.get("message") or "The selected service did not stop; no replacement was started.")

            start_options = dict(options)
            if key == "web":
                start_options["scoped_restart"] = True
            if key == "watchFusion":
                start_options["host"] = "0.0.0.0" if mode == "lan" else "127.0.0.1"
            if key == "localMoe":
                start_options["start_runtime"] = before.get("runtimeManagedRunning") is True or before.get("runtimeReady") is True
            stage = "start"
            after = controller.start_server(**start_options)
            ready = after.get("ok") is True and after.get("running") is True
            accepted = ready or (after.get("ok") is True and after.get("state") == "starting")
            if not accepted:
                return _receipt(
                    key, after, ok=False, restartStage=stage, previousPids=before.get("pids", []),
                    spotify=spotify_prepared, expectedSourceFingerprint=expected_web_source,
                    message=after.get("message") or f"{key} stopped, but its replacement could not start.",
                )

            if key == "web":
                fresh_instance = bool(after.get("instanceId")) and after.get("instanceId") != before.get("instanceId")
                fresh_source = after.get("sourceFingerprint") == expected_web_source
                if not ready or not fresh_instance or not fresh_source:
                    return _receipt(
                        key, after, ok=False, restartStage="verify", previousPids=before.get("pids", []),
                        previousInstanceId=before.get("instanceId", ""),
                        previousSourceFingerprint=before.get("sourceFingerprint", ""),
                        expectedSourceFingerprint=expected_web_source, spotify=spotify_prepared,
                        message="Web replacement did not prove a fresh healthy runtime running the current source fingerprint.",
                    )
                stage = "spotify-restore"
                restored = eveos_spotify_reload.restore_helper(int(options["port"]), spotify_prepared)
                if restored.get("ok") is not True:
                    return _receipt(
                        key, after, ok=False, restartStage=stage, previousPids=before.get("pids", []),
                        previousInstanceId=before.get("instanceId", ""),
                        previousSourceFingerprint=before.get("sourceFingerprint", ""),
                        expectedSourceFingerprint=expected_web_source,
                        spotify={"prepared": spotify_prepared, "restored": restored},
                        message=restored.get("reason") or "Web restarted, but Spotify readiness could not be restored safely.",
                    )
                spotify_prepared = {"prepared": spotify_prepared, "restored": restored}

            return _receipt(
                key, after, ok=accepted, restartStage="verify" if ready else stage, serviceRestarted=ready,
                previousPids=before.get("pids", []),
                previousInstanceId=before.get("instanceId", "") if key == "web" else "",
                previousSourceFingerprint=before.get("sourceFingerprint", "") if key == "web" else "",
                expectedSourceFingerprint=expected_web_source if key == "web" else "",
                restartRequestedAt=datetime.now(timezone.utc).isoformat(),
                spotify=spotify_prepared,
                message=(
                    "EveOS web restarted with fresh identity/current source; Spotify dependency is healthy and idle."
                    if key == "web" and ready
                    else after.get("message") or (f"{key} restarted." if ready else f"{key} replacement is starting.")
                ),
            )
    except Exception as exc:  # noqa: BLE001
        return _receipt(key, before, ok=False, restartStage=stage, spotify=spotify_prepared,
                        expectedSourceFingerprint=expected_web_source,
                        message=f"{key} restart failed during {stage}: {exc}")
    finally:
        lock.release()
