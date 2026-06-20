"""Local Audioflix audio bridge.

This module is intentionally loopback-only. Browser APIs can route EveOS-owned
audio to permitted sinks, but native endpoint enumeration/playback needs a local
helper. `sounddevice` is optional: without it the API still reports Windows
endpoint names from the OS, but native PCM playback is unavailable.
"""

from __future__ import annotations

import base64
import json
import queue
import subprocess
import threading
import time
from http import HTTPStatus

try:
    import numpy as np
except Exception:  # pragma: no cover - optional runtime dependency
    np = None

try:
    import sounddevice as sd
except Exception:  # pragma: no cover - optional runtime dependency
    sd = None


_PLAYERS: dict[str, "_PcmPlayer"] = {}
_LOCK = threading.Lock()


def _send_json(handler, payload: dict, status: int = HTTPStatus.OK) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_json(handler) -> dict:
    try:
        length = int(handler.headers.get("Content-Length", "0") or 0)
    except ValueError:
        length = 0
    if length <= 0:
        return {}
    raw = handler.rfile.read(length).decode("utf-8", errors="replace")
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _can_control(handler) -> bool:
    host = str(handler.client_address[0] if handler.client_address else "")
    if host not in {"127.0.0.1", "::1"}:
        return False
    origin = str(handler.headers.get("Origin", "")).strip().lower()
    if not origin or origin == "null":
        return True
    return origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:")


def _sd_outputs() -> list[dict]:
    if sd is None:
        return []
    devices = []
    for index, info in enumerate(sd.query_devices()):
        if int(info.get("max_output_channels") or 0) <= 0:
            continue
        devices.append({
            "id": f"sd:{index}",
            "index": index,
            "label": str(info.get("name") or f"Output device {index}"),
            "kind": "output",
            "channels": int(info.get("max_output_channels") or 0),
            "sampleRate": float(info.get("default_samplerate") or 0),
            "source": "sounddevice",
            "playable": True,
        })
    return devices


def _windows_endpoint_names() -> list[dict]:
    if not hasattr(subprocess, "run"):
        return []
    script = (
        "Get-CimInstance Win32_PnPEntity | "
        "Where-Object { $_.PNPClass -eq 'AudioEndpoint' -and $_.Name } | "
        "Select-Object Name,DeviceID,Status | ConvertTo-Json -Compress"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception:
        return []
    if result.returncode != 0 or not result.stdout.strip():
        return []
    try:
        raw = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []
    rows = raw if isinstance(raw, list) else [raw]
    devices = []
    for idx, row in enumerate(rows):
        label = str(row.get("Name") or "").strip()
        if not label:
            continue
        devices.append({
            "id": f"win:{idx}",
            "label": label,
            "kind": _guess_endpoint_kind(label),
            "status": str(row.get("Status") or ""),
            "source": "windows",
            "playable": False,
        })
    return devices


def _guess_endpoint_kind(label: str) -> str:
    lowered = str(label or "").lower()
    # VB-CABLE names are intentionally reversed from user intent:
    # CABLE Input is the playback/render endpoint, CABLE Output is capture.
    if "cable input" in lowered or "voicemeeter input" in lowered or "speakers" in lowered:
        return "output"
    if "cable output" in lowered or "voicemeeter output" in lowered:
        return "input"
    if any(token in lowered for token in ("microphone", "line in", "recording", "capture")):
        return "input"
    return "output"


def list_devices() -> dict:
    sd_outputs = _sd_outputs()
    win_devices = _windows_endpoint_names()
    seen = {item["label"].lower() for item in sd_outputs}
    merged = sd_outputs + [item for item in win_devices if item["label"].lower() not in seen]
    return {
        "ok": True,
        "bridge": True,
        "playbackAvailable": sd is not None and np is not None,
        "devices": merged,
        "message": "Native playback ready." if sd is not None and np is not None
        else "Install sounddevice to enable native playback; endpoint names are discovery-only.",
    }


class _PcmPlayer:
    def __init__(self, device_index: int, sample_rate: int, channels: int) -> None:
        self.device_index = device_index
        self.sample_rate = sample_rate
        self.channels = channels
        self.q: queue.Queue = queue.Queue(maxsize=64)
        self.pending = None
        self.closed = False
        self.last_used = time.monotonic()
        self.stream = sd.OutputStream(
            samplerate=sample_rate,
            channels=channels,
            dtype="float32",
            device=device_index,
            blocksize=1024,
            callback=self._callback,
        )
        self.stream.start()

    def _callback(self, outdata, frames, _time_info, _status) -> None:
        outdata.fill(0)
        written = 0
        while written < frames:
            if self.pending is None or len(self.pending) == 0:
                try:
                    self.pending = self.q.get_nowait()
                except queue.Empty:
                    break
            take = min(frames - written, len(self.pending))
            outdata[written:written + take, 0] = self.pending[:take]
            self.pending = self.pending[take:]
            written += take

    def enqueue(self, samples) -> None:
        self.last_used = time.monotonic()
        try:
            self.q.put_nowait(samples)
        except queue.Full:
            while not self.q.empty():
                try:
                    self.q.get_nowait()
                except queue.Empty:
                    break
            self.q.put_nowait(samples)

    def close(self) -> None:
        self.closed = True
        try:
            self.stream.stop()
            self.stream.close()
        except Exception:
            pass


def _player_for(device_id: str, sample_rate: int, channels: int) -> _PcmPlayer:
    if sd is None or np is None:
        raise RuntimeError("Native playback requires the optional sounddevice and numpy packages.")
    if not str(device_id).startswith("sd:"):
        raise RuntimeError("Selected native output is not a playable sounddevice endpoint.")
    key = f"{device_id}:{sample_rate}:{channels}"
    index = int(str(device_id).split(":", 1)[1])
    with _LOCK:
        player = _PLAYERS.get(key)
        if player is None or player.closed:
            player = _PcmPlayer(index, sample_rate, channels)
            _PLAYERS[key] = player
        return player


def play_pcm(payload: dict) -> dict:
    if sd is None or np is None:
        return {"ok": False, "message": "Native playback requires sounddevice and numpy."}
    audio = str(payload.get("audio") or "")
    device_id = str(payload.get("deviceId") or "")
    sample_rate = int(payload.get("sampleRate") or 24000)
    channels = max(1, int(payload.get("channels") or 1))
    if not audio:
        return {"ok": False, "message": "Missing PCM audio payload."}
    raw = base64.b64decode(audio)
    samples = np.frombuffer(raw, dtype="<i2").astype("float32") / 32768.0
    if channels > 1:
        samples = samples.reshape((-1, channels))[:, 0]
    player = _player_for(device_id, sample_rate, 1)
    player.enqueue(samples)
    return {
        "ok": True,
        "queued": int(samples.shape[0]),
        "sampleRate": sample_rate,
        "deviceId": device_id,
    }


def handle_get_request(handler, path: str, _query) -> bool:
    if path == "/api/audioflix/status":
        payload = list_devices()
        payload["devices"] = []
        _send_json(handler, payload)
        return True
    if path == "/api/audioflix/devices":
        _send_json(handler, list_devices())
        return True
    return False


def handle_post_request(handler, path: str) -> bool:
    if path != "/api/audioflix/play-pcm":
        return False
    if not _can_control(handler):
        _send_json(handler, {"ok": False, "message": "Local access required."}, HTTPStatus.FORBIDDEN)
        return True
    try:
        _send_json(handler, play_pcm(_read_json(handler)))
    except Exception as exc:
        _send_json(handler, {"ok": False, "message": str(exc)}, HTTPStatus.BAD_REQUEST)
    return True
