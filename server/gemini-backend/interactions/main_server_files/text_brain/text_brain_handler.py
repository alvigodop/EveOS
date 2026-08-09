"""Mode 2 text-brain handler.

Handles `text_brain_request` WebSocket messages. The text brain is a large-context
text model selected through the model registry. It holds conversation history + EveOS
context and produces the line the live voice model should speak. It is a plain
request/response over the existing socket - it does NOT touch the live audio session,
so Mode 1 is unaffected.

Client message shape:
    {
        "type": "text_brain_request",
        "requestId": "<id>",
        "text": "<user utterance>",
        "history": [ {"role": "user"|"model", "text": "..."}, ... ],
        "context": "<optional system/context string>"
    }

Reply:
    { "type": "text_brain_response", "requestId", "text", "usage": {prompt, output, total}, "model" }
    { "type": "text_brain_error", "requestId", "error" }
"""

import json
import time
import traceback

from google.genai import types

from main_server_files.api_configuration.gemini_config import (
    TEXT_BRAIN_CONFIG,
    TEXT_BRAIN_SYSTEM_PREFIX,
)
from main_server_files.api_configuration.model_registry import resolve_text_brain_model


async def handle_text_brain_request(data, connection_monitor, client):
    """Run the text brain for one user turn and stream the reply back to the client."""
    request_id = data.get("requestId") or data.get("request_id")
    user_text = str(data.get("text") or "").strip()
    history = data.get("history") or []
    context = data.get("context") or data.get("system") or ""

    if not user_text:
        await _send(connection_monitor, {
            "type": "text_brain_error",
            "requestId": request_id,
            "error": "Empty user text",
        })
        return

    try:
        if client is None:
            raise RuntimeError("Gemini client is not configured for the text brain")

        system_instruction = TEXT_BRAIN_SYSTEM_PREFIX
        if context:
            system_instruction = f"{system_instruction}\n\n[EVEOS CONTEXT]\n{context}"

        # Model is picked in Session Controls; validated against the allowlist (unknown -> default).
        selected_model = resolve_text_brain_model(data.get("model"))
        contents = _build_contents(history, user_text)
        response = await client.aio.models.generate_content(
            model=selected_model,
            contents=contents,
            config=types.GenerateContentConfig(
                **TEXT_BRAIN_CONFIG,
                system_instruction=system_instruction,
            ),
        )

        reply = _extract_text(response)
        usage = _extract_usage(response)

        await _send(connection_monitor, {
            "type": "text_brain_response",
            "requestId": request_id,
            "text": reply,
            "usage": usage,
            "model": selected_model,
            "timestamp": time.time(),
        })
    except Exception as exc:  # noqa: BLE001 - report any failure to the client, never crash the session
        traceback.print_exc()
        await _send(connection_monitor, {
            "type": "text_brain_error",
            "requestId": request_id,
            "error": str(exc),
        })


def _build_contents(history, user_text):
    """Map client history and this turn into google-genai content dictionaries."""
    contents = []
    for turn in history if isinstance(history, list) else []:
        if not isinstance(turn, dict):
            continue
        text = turn.get("text") or turn.get("content") or ""
        if not text:
            continue
        raw_role = str(turn.get("role") or "user").lower()
        role = "model" if raw_role in ("model", "assistant", "ai", "gemini") else "user"
        contents.append({"role": role, "parts": [{"text": str(text)}]})
    contents.append({"role": "user", "parts": [{"text": user_text}]})
    return contents


def _extract_text(response):
    """Best-effort extraction of the reply text across SDK response shapes."""
    try:
        if getattr(response, "text", None):
            return response.text.strip()
    except Exception:  # noqa: BLE001 - .text can raise when blocked; fall through
        pass
    try:
        parts = getattr(response, "parts", None) or []
        joined = " ".join(p.text for p in parts if getattr(p, "text", None))
        if joined.strip():
            return joined.strip()
    except Exception:  # noqa: BLE001
        pass
    return ""


def _extract_usage(response):
    """Pull token counts from usage_metadata for the Mode 2 token meter."""
    meta = getattr(response, "usage_metadata", None)
    if not meta:
        return {"prompt": 0, "output": 0, "total": 0}
    prompt = int(getattr(meta, "prompt_token_count", 0) or 0)
    output = int(getattr(meta, "candidates_token_count", 0) or 0)
    cached = int(getattr(meta, "cached_content_token_count", 0) or 0)
    thoughts = int(getattr(meta, "thoughts_token_count", 0) or 0)
    total = int(getattr(meta, "total_token_count", 0) or (prompt + output + thoughts))
    return {
        "prompt": prompt,
        "cached": cached,
        "output": output,
        "thoughts": thoughts,
        "total": total,
    }


async def _send(connection_monitor, obj):
    try:
        await connection_monitor.safe_send(json.dumps(obj))
    except Exception as exc:  # noqa: BLE001
        print(f"[TextBrain] Failed to send response to client: {exc}")
