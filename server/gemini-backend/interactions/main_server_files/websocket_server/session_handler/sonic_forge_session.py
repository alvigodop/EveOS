"""Secure browser-to-Lyria relay for Sonic Forge.

The browser sends only bounded control messages. The Gemini API key remains in
the EveOS credential vault and is consumed by the backend client.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import suppress

import websockets
from google.genai import types

from ...api_configuration.model_registry import resolve_music_model


_CONFIG_FIELDS = {
    "temperature",
    "topK",
    "seed",
    "guidance",
    "bpm",
    "density",
    "brightness",
    "scale",
    "muteBass",
    "muteDrums",
    "onlyBassAndDrums",
    "musicGenerationMode",
}


async def _send(monitor, payload: dict) -> None:
    if monitor.is_websocket_open():
        await monitor.safe_send(json.dumps(payload))


def _prompts(payload: object) -> list[types.WeightedPrompt]:
    rows = payload if isinstance(payload, list) else []
    prompts = []
    for row in rows[:16]:
        if not isinstance(row, dict):
            continue
        text = str(row.get("text") or "").strip()[:500]
        if not text:
            continue
        try:
            weight = float(row.get("weight") or 1.0)
        except (TypeError, ValueError):
            weight = 1.0
        weight = max(0.01, min(2.0, weight))
        prompts.append(types.WeightedPrompt(text=text, weight=weight))
    if not prompts:
        prompts.append(types.WeightedPrompt(text="ambient instrumental music", weight=1.0))
    return prompts


def _config(payload: object) -> types.LiveMusicGenerationConfig:
    source = payload if isinstance(payload, dict) else {}
    clean = {key: source[key] for key in _CONFIG_FIELDS if key in source}
    return types.LiveMusicGenerationConfig.model_validate(clean)


async def _commands(websocket, music_session) -> None:
    async for raw in websocket:
        try:
            message = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(message, dict):
            continue
        if message.get("type") != "sonic_forge_command":
            continue
        action = str(message.get("action") or "").strip()
        if action == "set_weighted_prompts":
            await music_session.set_weighted_prompts(_prompts(message.get("prompts")))
        elif action == "set_music_generation_config":
            await music_session.set_music_generation_config(_config(message.get("config")))
        elif action == "play":
            await music_session.play()
        elif action == "pause":
            await music_session.pause()
        elif action == "stop":
            await music_session.stop()
        elif action == "reset_context":
            await music_session.reset_context()
        elif action == "close":
            return


async def _responses(music_session, monitor) -> None:
    async for message in music_session.receive():
        payload = message.model_dump(by_alias=True, exclude_none=True, mode="json")
        # Pydantic serializes bytes as Base64URL. Browsers conventionally consume
        # PCM blobs with atob(), so normalize the relay contract to standard Base64.
        content = payload.get("serverContent") if isinstance(payload, dict) else None
        chunks = content.get("audioChunks") if isinstance(content, dict) else None
        for chunk in chunks if isinstance(chunks, list) else []:
            data = chunk.get("data") if isinstance(chunk, dict) else None
            if isinstance(data, str):
                standard = data.replace("-", "+").replace("_", "/")
                chunk["data"] = standard + ("=" * (-len(standard) % 4))
        await _send(monitor, {
            "type": "sonic_forge_message",
            "message": payload,
        })


async def execute_sonic_forge_session(websocket, client, monitor, model_name) -> None:
    """Run one bounded Lyria relay until either side closes."""
    model = resolve_music_model(model_name)
    try:
        async with client.aio.live.music.connect(model=model) as music_session:
            await _send(monitor, {
                "type": "sonic_forge_ready",
                "sessionRole": "sonic_forge",
                "model": model,
            })
            tasks = {
                asyncio.create_task(_commands(websocket, music_session)),
                asyncio.create_task(_responses(music_session, monitor)),
            }
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in pending:
                with suppress(asyncio.CancelledError):
                    await task
            for task in done:
                task.result()
    except websockets.exceptions.ConnectionClosed:
        return
    except Exception as error:
        await _send(monitor, {
            "type": "sonic_forge_error",
            "message": str(error) or "Sonic Forge backend session failed.",
        })
        raise
