"""Pure helpers for Local MoE status and explicit model-runtime bootstrap."""

from __future__ import annotations

from collections.abc import Callable


def live_details(http_json: Callable, harness_port: int) -> dict:
    payload = http_json(harness_port, "/api/status", timeout=4.5) or {}
    runtime = payload.get("runtime") if isinstance(payload.get("runtime"), dict) else {}
    lifecycle = (
        payload.get("runtime_lifecycle")
        if isinstance(payload.get("runtime_lifecycle"), dict)
        else {}
    )
    settings = payload.get("settings") if isinstance(payload.get("settings"), dict) else {}
    active_id = str(settings.get("active_model_id") or "")
    active_model = next(
        (
            item
            for item in payload.get("model_registry") or []
            if isinstance(item, dict) and item.get("id") == active_id
        ),
        {},
    )
    return {
        "runtimeReady": runtime.get("ready") is True,
        "runtimeReachable": runtime.get("reachable") is True,
        "runtimeHealth": str(runtime.get("health_status") or "unknown"),
        "runtimeManagedRunning": lifecycle.get("managed_running") is True,
        "runtimeStartupStage": str(lifecycle.get("startup_stage") or ""),
        "runtimeLastError": str(lifecycle.get("last_error") or ""),
        "activeModel": {
            "id": active_id,
            "label": str(active_model.get("display_name") or active_model.get("id") or active_id),
            "validation": str(active_model.get("validation") or ""),
        },
        "activeProfile": str(settings.get("active_profile_label") or settings.get("active_profile") or ""),
        "system": payload.get("system") if isinstance(payload.get("system"), dict) else {},
        "gpuCoexistence": (
            payload.get("gpu_coexistence") if isinstance(payload.get("gpu_coexistence"), dict) else {}
        ),
    }


def start_runtime_for_explicit_request(
    status: dict,
    *,
    http_json: Callable,
    harness_port: int,
    refresh_status: Callable[[], dict],
) -> dict:
    should_start = (
        status.get("running") is True
        and status.get("runtimeReady") is not True
        and status.get("runtimeManagedRunning") is not True
        and status.get("runtimeReachable") is not True
    )
    if not should_start:
        return status

    accepted = http_json(
        harness_port,
        "/api/runtime/start",
        method="POST",
        timeout=8.0,
    )
    refreshed = refresh_status()
    if accepted is None:
        return {
            **refreshed,
            "runtimeStartAccepted": False,
            "message": (
                "Local MoE Harness is online, but model startup could not be confirmed. "
                "Use Start model to retry."
            ),
        }
    return {
        **refreshed,
        "runtimeStartAccepted": True,
        "message": (
            "Local MoE Harness is online; selected model startup was requested."
            if refreshed.get("runtimeReady") is not True
            else "Local MoE Harness and selected model are ready."
        ),
    }
