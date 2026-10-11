"""Local-Control-side Spotify dependency handling for selective EveOS updates."""
from __future__ import annotations

import http.client
import json
import time
from urllib.parse import urlsplit

_CANONICAL_ENGINE_PATH = "/tools/audioflix/spotify-engine.html"


def _request(port: int, path: str, *, method: str = "GET", payload: dict | None = None,
             timeout: float = 8.0) -> dict:
    body = b""
    headers = {"Connection": "close"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers.update({"Content-Type": "application/json", "Content-Length": str(len(body))})
    connection = http.client.HTTPConnection("127.0.0.1", int(port), timeout=timeout)
    try:
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        raw = response.read(256 * 1024)
        try:
            parsed = json.loads(raw.decode("utf-8", errors="replace")) if raw else {}
        except ValueError:
            parsed = {}
        if response.status >= 400:
            reason = parsed.get("reason") or parsed.get("message") or f"HTTP {response.status}"
            return {"ok": False, "reason": reason, "httpStatus": response.status, **parsed}
        return parsed if isinstance(parsed, dict) else {"ok": False, "reason": "Invalid JSON response."}
    except (OSError, http.client.HTTPException) as exc:
        return {"ok": False, "reason": str(exc)}
    finally:
        try:
            connection.close()
        except OSError:
            pass


def _canonical_page(port: int, value: str = "") -> str:
    raw = str(value or "").strip()
    if raw:
        try:
            parsed = urlsplit(raw)
            if parsed.scheme in {"http", "https"} and parsed.hostname in {"127.0.0.1", "localhost", "::1"}:
                return f"http://127.0.0.1:{int(port)}{_CANONICAL_ENGINE_PATH}"
        except (ValueError, TypeError):
            pass
    return f"http://127.0.0.1:{int(port)}{_CANONICAL_ENGINE_PATH}"


def snapshot(port: int) -> dict:
    return _request(port, "/api/audioflix/spotify-browser/status", timeout=4.0)


def prepare_web_restart(port: int) -> dict:
    """Ask the current web process to reset ownership and stop its own verified helper."""
    return _request(port, "/api/audioflix/spotify-browser/prepare-restart",
                    method="POST", payload={}, timeout=25.0)


def restore_helper(port: int, prepared: dict) -> dict:
    """Restore only the helper lifecycle that existed before replacement; never resume playback."""
    prepared = prepared if isinstance(prepared, dict) else {}
    if prepared.get("helperWasRunning") is not True:
        return {"ok": True, "helperRestored": False, "reason": "Spotify helper was previously stopped."}

    page_url = _canonical_page(port, prepared.get("pageUrl"))
    started = _request(port, "/api/audioflix/spotify-browser/start", method="POST",
                       payload={"pageUrl": page_url}, timeout=35.0)
    if started.get("ok") is not True:
        return {"ok": False, "stage": "helper-start", "reason": started.get("reason") or started.get("message") or "Spotify helper start failed."}

    presentation = str(prepared.get("presentation") or "hidden")
    if presentation in {"hidden", "background", "window", "headless"}:
        applied = _request(port, "/api/audioflix/spotify-browser/presentation", method="POST",
                           payload={"mode": presentation, "pageUrl": page_url}, timeout=25.0)
        if applied.get("ok") is not True:
            return {"ok": False, "stage": "presentation", "reason": applied.get("reason") or applied.get("message") or "Spotify presentation restore failed."}

    desired_volume = prepared.get("desiredVolume")
    if desired_volume is not None:
        volume = _request(port, "/api/audioflix/spotify-browser/qualify-volume", method="POST",
                          payload={"volume": desired_volume}, timeout=8.0)
        if volume.get("ok") is not True:
            return {"ok": False, "stage": "volume", "reason": volume.get("reason") or volume.get("message") or "Spotify volume restore failed."}

    deadline = time.monotonic() + 12.0
    last = {}
    while time.monotonic() < deadline:
        last = snapshot(port)
        healthy = last.get("ok") is True and last.get("helperReachable") is True
        idle = int(last.get("playingCount") or 0) == 0 and not list(last.get("trackIds") or [])
        auth_ok = prepared.get("authState") != "signed-in" or last.get("authState") == "signed-in"
        canonical = str(last.get("pageUrl") or "").split("?", 1)[0].endswith(_CANONICAL_ENGINE_PATH)
        if healthy and idle and auth_ok and canonical:
            return {
                "ok": True, "helperRestored": True, "pageUrl": last.get("pageUrl"),
                "authState": last.get("authState"), "desiredVolume": last.get("desiredVolume"),
                "playingCount": last.get("playingCount"), "trackIds": list(last.get("trackIds") or []),
                "autoplay": False,
            }
        time.sleep(0.25)
    return {"ok": False, "stage": "verify", "reason": "Spotify helper did not return healthy and idle after restart.", "status": last}


def restart_helper(port: int) -> dict:
    """Restart only the running, web-owned managed Spotify helper."""
    before = snapshot(port)
    if before.get("helperReachable") is not True and before.get("browserRunning") is not True:
        return {"ok": False, "serviceKey": "spotifyEngine", "serviceRestarted": False,
                "message": "Spotify helper is stopped, so there is nothing to restart."}
    prepared = prepare_web_restart(port)
    if prepared.get("ok") is not True:
        return {"ok": False, "serviceKey": "spotifyEngine", "serviceRestarted": False,
                "restartStage": prepared.get("stage") or "prepare", "message": prepared.get("reason") or "Spotify prepare-restart failed."}
    restored = restore_helper(port, prepared)
    return {
        **restored,
        "serviceKey": "spotifyEngine",
        "serviceRestarted": restored.get("ok") is True and restored.get("helperRestored") is True,
        "restartStage": "verify" if restored.get("ok") else restored.get("stage") or "verify",
        "previous": {"pageUrl": before.get("pageUrl"), "authState": before.get("authState"),
                     "desiredVolume": before.get("desiredVolume"), "playingCount": before.get("playingCount")},
        "message": "Managed Spotify engine restarted and is idle." if restored.get("ok") else restored.get("reason") or "Managed Spotify engine restart failed.",
    }
