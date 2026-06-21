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
import re
import subprocess
import threading
import time
from http import HTTPStatus
from pathlib import Path

from server_modules import audioflix_bridge_media

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
_DEVICE_CACHE: dict = {"at": 0.0, "payload": None}
_DEVICE_CACHE_TTL = 10.0
_PROJECT_ROOT = Path(__file__).resolve().parents[1]


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
        if length > 0:
            parsed = json.loads(handler.rfile.read(length).decode("utf-8", errors="replace"))
            return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass
    return {}


def _can_control(handler) -> bool:
    host = str(handler.client_address[0] if handler.client_address else "")
    if host not in {"127.0.0.1", "::1"}:
        return False
    origin = str(handler.headers.get("Origin", "")).strip().lower()
    return not origin or origin == "null" or origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:")


def _sd_outputs() -> list[dict]:
    if sd is None:
        return []
    hostapis = sd.query_hostapis()
    devices = []
    for index, info in enumerate(sd.query_devices()):
        if int(info.get("max_output_channels") or 0) <= 0:
            continue
        hostapi_index = int(info.get("hostapi") or 0)
        hostapi = str(hostapis[hostapi_index].get("name") or "") if hostapi_index < len(hostapis) else ""
        label = str(info.get("name") or f"Output device {index}")
        if hostapi:
            label = f"{label} ({hostapi})"
        devices.append({
            "id": f"sd:{index}",
            "index": index,
            "label": label,
            "kind": "output",
            "channels": int(info.get("max_output_channels") or 0),
            "sampleRate": float(info.get("default_samplerate") or 0),
            "hostApi": hostapi,
            "source": "sounddevice",
            "playable": True,
        })
    return devices


def _sd_inputs() -> list[dict]:
    if sd is None:
        return []
    hostapis = sd.query_hostapis()
    devices = []
    for index, info in enumerate(sd.query_devices()):
        if int(info.get("max_input_channels") or 0) <= 0:
            continue
        hostapi_index = int(info.get("hostapi") or 0)
        hostapi = str(hostapis[hostapi_index].get("name") or "") if hostapi_index < len(hostapis) else ""
        label = str(info.get("name") or f"Input device {index}")
        if _looks_broken_label(label) or _is_low_level_output({"hostApi": hostapi}):
            continue
        if hostapi:
            label = f"{label} ({hostapi})"
        devices.append({
            "id": f"sd-in:{index}",
            "index": index,
            "label": label,
            "kind": "input",
            "channels": int(info.get("max_input_channels") or 0),
            "sampleRate": float(info.get("default_samplerate") or 0),
            "hostApi": hostapi,
            "source": "sounddevice",
            "playable": False,
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
    if any(t in lowered for t in ("cable input", "voicemeeter input", "speakers")):
        return "output"
    if any(t in lowered for t in ("cable output", "voicemeeter output", "microphone", "line in", "recording", "capture")):
        return "input"
    return "output"


def _normalized_label(label: str) -> str:
    text = re.sub(r"\s*\((?:MME|Windows DirectSound|Windows WASAPI|Windows WDM-KS|ASIO)\)\s*$", "", str(label or "").strip(), flags=re.IGNORECASE)
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _is_generic_output(label: str) -> bool:
    return str(label or "").strip().lower() in {"microsoft sound mapper - output", "primary sound driver"}


def _is_low_level_output(item: dict) -> bool:
    return "wdm-ks" in str(item.get("hostApi") or "").lower()


def _looks_broken_label(label: str) -> bool:
    t = str(label or "").strip()
    return not t or t.endswith("()") or t.endswith("(")


def _rank_output(item: dict) -> int:
    label = str(item.get("label") or "")
    hostapi = str(item.get("hostApi") or "").lower()
    rank = 0 if "wasapi" in hostapi else (10 if "directsound" in hostapi else (20 if hostapi == "mme" else (90 if "wdm-ks" in hostapi else 50)))
    if _is_generic_output(label):
        rank += 100
    if _looks_broken_label(label):
        rank += 40
    if "cable input" in label.lower():
        rank -= 10
    elif "voicemeeter" in label.lower():
        rank -= 6
    return rank


def _same_output_label(left: str, right: str) -> bool:
    a = _normalized_label(left)
    b = _normalized_label(right)
    if not a or not b:
        return False
    if a == b:
        return True
    return min(len(a), len(b)) >= 18 and (a.startswith(b) or b.startswith(a))


def _merge_outputs(sd_outputs: list[dict], win_devices: list[dict]) -> list[dict]:
    playable = [item for item in sd_outputs
                if not _is_generic_output(item.get("label", ""))
                and not _looks_broken_label(item.get("label", ""))
                and not _is_low_level_output(item)]
    candidates = playable or [item for item in sd_outputs if not _is_generic_output(item.get("label", ""))]
    merged: list[dict] = []
    for item in sorted(candidates, key=_rank_output):
        if any(item.get("hostApi") == kept.get("hostApi") and _same_output_label(item.get("label", ""), kept.get("label", "")) for kept in merged):
            continue
        merged.append(item)
    for item in win_devices:
        if item.get("kind") != "output":
            continue
        if str(item.get("status") or "").upper() not in {"", "OK"}:
            continue
        if any(_same_output_label(item.get("label", ""), kept.get("label", "")) for kept in merged):
            continue
        merged.append(item)
    return merged


def _merge_inputs(sd_inputs: list[dict], win_devices: list[dict]) -> list[dict]:
    merged: list[dict] = []
    for item in sorted(sd_inputs, key=_rank_output):
        if any(item.get("hostApi") == kept.get("hostApi") and _same_output_label(item.get("label", ""), kept.get("label", "")) for kept in merged):
            continue
        merged.append(item)
    for item in win_devices:
        if item.get("kind") != "input":
            continue
        if str(item.get("status") or "").upper() not in {"", "OK"}:
            continue
        if any(_same_output_label(item.get("label", ""), kept.get("label", "")) for kept in merged):
            continue
        merged.append(item)
    return merged


def _copy_device_payload(payload: dict, cached: bool) -> dict:
    return {**payload, "cached": cached, "devices": [dict(d) for d in payload.get("devices", [])]}


def list_devices(force: bool = False) -> dict:
    now = time.monotonic()
    cached_payload = _DEVICE_CACHE.get("payload")
    if not force and cached_payload and now - float(_DEVICE_CACHE.get("at") or 0.0) < _DEVICE_CACHE_TTL:
        return _copy_device_payload(cached_payload, True)

    sd_outputs = _sd_outputs()
    sd_inputs = _sd_inputs()
    win_devices = _windows_endpoint_names()
    merged_outputs = _merge_outputs(sd_outputs, win_devices)
    merged_inputs = _merge_inputs(sd_inputs, win_devices)
    merged = merged_outputs + merged_inputs
    payload = {
        "ok": True,
        "bridge": True,
        "playbackAvailable": sd is not None and np is not None,
        "devices": merged,
        "deviceCount": len(merged),
        "scannedAt": time.time(),
        "cacheTtl": _DEVICE_CACHE_TTL,
        "message": "Native playback ready." if sd is not None and np is not None
        else "Install sounddevice to enable native playback; endpoint names are discovery-only.",
    }
    _DEVICE_CACHE["at"] = now
    _DEVICE_CACHE["payload"] = payload
    return _copy_device_payload(payload, False)


def _resample_mono(samples, src_rate: int, dst_rate: int):
    if np is None or not src_rate or not dst_rate or int(src_rate) == int(dst_rate):
        return samples
    mono = np.asarray(samples, dtype="float32").reshape(-1)
    if mono.size == 0:
        return mono
    dst_count = int(round(mono.size * (int(dst_rate) / float(src_rate))))
    if dst_count <= 0:
        return mono[:0]
    return np.interp(np.linspace(0.0, mono.size - 1, dst_count), np.arange(mono.size), mono).astype("float32")


def _open_output_stream(device_index: int, channels: int, callback, preferred_rate: int):
    rates = [preferred_rate] if preferred_rate else []
    try:
        r = int(sd.query_devices(device_index).get("default_samplerate") or 0)
        if r:
            rates.append(r)
    except Exception:
        pass
    rates.extend([48000, 44100, 96000, 32000, 24000, 16000])
    seen, last_err = set(), None
    for rate in rates:
        r = int(rate or 0)
        if r <= 0 or r in seen:
            continue
        seen.add(r)
        try:
            stream = sd.OutputStream(samplerate=r, channels=channels, dtype="float32", device=device_index, blocksize=1024, callback=callback)
            stream.start()
            return stream, r
        except Exception as err:
            last_err = err
    raise RuntimeError(f"Could not open stream for {device_index}: {last_err}")


class _PcmPlayer:
    def __init__(self, device_index: int, source_rate: int, channels: int) -> None:
        self.device_index, self.source_rate, self.channels = device_index, int(source_rate), channels
        self.q, self.pending, self.closed, self.last_used = queue.Queue(maxsize=64), None, False, time.monotonic()
        self.stream, self.sample_rate = _open_output_stream(device_index, channels, self._callback, source_rate)

    def _callback(self, outdata, frames, _time_info, _status) -> None:
        outdata.fill(0)
        written = 0
        while written < frames:
            if not self.pending or len(self.pending) == 0:
                try:
                    self.pending = self.q.get_nowait()
                except queue.Empty:
                    break
            take = min(frames - written, len(self.pending))
            outdata[written:written + take, 0] = self.pending[:take]
            self.pending, written = self.pending[take:], written + take

    def enqueue(self, samples) -> None:
        self.last_used = time.monotonic()
        samples = _resample_mono(samples, self.source_rate, self.sample_rate)
        try:
            self.q.put_nowait(samples)
        except queue.Full:
            while not self.q.empty():
                try:
                    self.q.get_nowait()
                except queue.Empty:
                    break
            try:
                self.q.put_nowait(samples)
            except queue.Full:
                pass

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


def _enqueue_mono(device_id: str, sample_rate: int, samples, kind: str) -> dict:
    if sd is None or np is None:
        raise RuntimeError("Native playback requires the optional sounddevice and numpy packages.")
    if not device_id:
        raise RuntimeError("No native output device selected.")
    mono = np.asarray(samples, dtype="float32").reshape(-1)
    player = _player_for(device_id, sample_rate, 1)
    player.enqueue(mono)
    return {
        "ok": True,
        "kind": kind,
        "queued": int(mono.shape[0]),
        "sampleRate": sample_rate,
        "deviceId": device_id,
    }


def play_pcm(payload: dict) -> dict:
    if sd is None or np is None:
        return {"ok": False, "message": "Native playback requires sounddevice and numpy."}
    audio, device_id = str(payload.get("audio") or ""), str(payload.get("deviceId") or "")
    if not audio:
        return {"ok": False, "message": "Missing PCM audio payload."}
    samples = np.frombuffer(base64.b64decode(audio), dtype="<i2").astype("float32") / 32768.0
    channels = max(1, int(payload.get("channels") or 1))
    if channels > 1:
        samples = samples.reshape((-1, channels))[:, 0]
    return _enqueue_mono(device_id, int(payload.get("sampleRate") or 24000), samples, "pcm")


def play_tone(payload: dict) -> dict:
    if sd is None or np is None:
        return {"ok": False, "message": "Native playback requires sounddevice and numpy."}
    return audioflix_bridge_media.play_tone(payload, np, _enqueue_mono)


def play_media(payload: dict) -> dict:
    if sd is None or np is None:
        return {"ok": False, "message": "Native playback requires sounddevice and numpy."}
    return audioflix_bridge_media.play_media(payload, np, _enqueue_mono, _PROJECT_ROOT)


def handle_get_request(handler, path: str, query) -> bool:
    if path == "/api/audioflix/status":
        _send_json(handler, {**list_devices(), "devices": []})
    elif path == "/api/audioflix/devices":
        _send_json(handler, list_devices(force=bool(query.get("refresh") or query.get("force"))))
    else:
        return False
    return True


def handle_post_request(handler, path: str) -> bool:
    action = {"/api/audioflix/play-pcm": play_pcm, "/api/audioflix/play-tone": play_tone, "/api/audioflix/play-media": play_media}.get(path)
    if not action:
        return False
    if not _can_control(handler):
        _send_json(handler, {"ok": False, "message": "Local access required."}, HTTPStatus.FORBIDDEN)
        return True
    try:
        _send_json(handler, action(_read_json(handler)))
    except Exception as exc:
        _send_json(handler, {"ok": False, "message": str(exc)}, HTTPStatus.BAD_REQUEST)
    return True
