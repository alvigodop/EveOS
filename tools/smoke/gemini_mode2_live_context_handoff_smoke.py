"""Regression smoke for the Mode 2 Text Brain -> Gemini Live context handoff.

This intentionally executes the real realtime_input processor from its AST with tiny
stubs, so the smoke does not need google-genai installed. It verifies that Mode 2's
unique silent extraction frame is buffered (not sent as its own Live turn), merged
into the immediately following user turn, consumed once, expired safely, and that the
client request window stays long enough for late-but-valid Text Brain responses.
"""
from __future__ import annotations

import ast
import asyncio
import base64
import json
from pathlib import Path
import re
import time
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
PROCESSOR = ROOT / "server" / "gemini-backend" / "interactions" / "main_server_files" / "media_processing" / "realtime_input_processor.py"
MODE2_CONFIG = ROOT / "js" / "modules" / "gemini" / "mode2" / "textBrainRelay.config.js"
SOURCE = PROCESSOR.read_text(encoding="utf-8")
CONFIG_SOURCE = MODE2_CONFIG.read_text(encoding="utf-8")
TREE = ast.parse(SOURCE, filename=str(PROCESSOR))

timeout_match = re.search(r"REQUEST_TIMEOUT_MS:\s*(\d+)", CONFIG_SOURCE)
assert timeout_match, "Mode 2 request timeout config is missing"
assert int(timeout_match.group(1)) >= 40000, (
    "Mode 2 hard timeout regressed below 40s; valid ~20s Text Brain responses can lose the fallback race"
)

HELPERS = {
    "_is_mode2_turn_context",
    "_store_mode2_turn_context",
    "_consume_mode2_turn_context",
    "_merge_mode2_turn_context",
    "process_realtime_input",
}
CONSTANTS = {"MODE2_TURN_CONTEXT_PREFIXES", "MODE2_TURN_CONTEXT_TTL_SECONDS"}

selected = []
for node in TREE.body:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in HELPERS:
        selected.append(node)
    elif isinstance(node, ast.Assign):
        names = {target.id for target in node.targets if isinstance(target, ast.Name)}
        if names & CONSTANTS:
            selected.append(node)

assert {node.name for node in selected if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))} == HELPERS

history = []


def save_chat_history(text, is_user=False):
    history.append((text, is_user))


class Part:
    def __init__(self, text=None, inline_data=None):
        self.text = text
        self.inline_data = inline_data


class Content:
    def __init__(self, parts=None, role=None):
        self.parts = list(parts or [])
        self.role = role


class Blob:
    def __init__(self, mime_type=None, data=None):
        self.mime_type = mime_type
        self.data = data


namespace = {
    "asyncio": asyncio,
    "base64": base64,
    "json": json,
    "time": time,
    "types": SimpleNamespace(Part=Part, Content=Content, Blob=Blob),
    "save_chat_history": save_chat_history,
    "print": lambda *_args, **_kwargs: None,
}
module = ast.Module(body=selected, type_ignores=[])
ast.fix_missing_locations(module)
exec(compile(module, str(PROCESSOR), "exec"), namespace)
process_realtime_input = namespace["process_realtime_input"]
TTL = namespace["MODE2_TURN_CONTEXT_TTL_SECONDS"]


class Monitor:
    def __init__(self):
        self.sent = []

    def is_websocket_open(self):
        return True

    async def safe_send(self, payload):
        self.sent.append(json.loads(payload))


class Session:
    def __init__(self):
        self.system_sends = []
        self.client_sends = []

    async def send(self, **kwargs):
        self.system_sends.append(kwargs)

    async def send_client_content(self, **kwargs):
        self.client_sends.append(kwargs)


def text_frame(text, **extra):
    data = {
        "realtime_input": {"media_chunks": [{"mime_type": "text/plain", "data": text}]}
    }
    data.update(extra)
    return data


async def main():
    monitor = Monitor()
    session = Session()

    extracted = (
        "[MODE 2 VERIFIED EVEOS CONTEXT — authoritative facts for the current user turn. "
        "Do NOT claim the EveOS context is missing, unloaded, or needs to be sent through "
        "Context Relay.]\nBrowser card contains exactly 8 bookmarks."
    )
    await process_realtime_input(
        text_frame(
            extracted,
            source="modular_gemini_context",
            is_modular_context=True,
            is_system_context=True,
            silent_response=True,
        ),
        session,
        monitor,
        None,
    )
    assert session.system_sends == [], "Mode 2 extraction must not create a separate Live system turn"
    assert session.client_sends == [], "Mode 2 extraction must wait for its matching user turn"
    assert monitor.mode2_pending_turn_context == extracted

    question = "can you see my datapacks bookmarks?"
    await process_realtime_input(text_frame(question), session, monitor, None)
    assert len(session.client_sends) == 1, "matching user message should create exactly one Live turn"
    content = session.client_sends[0]["turns"]
    assert content.role == "user" and len(content.parts) == 1
    merged = content.parts[0].text
    assert extracted in merged, "extracted EveOS facts missing from atomic Live turn"
    assert question in merged, "user question missing from atomic Live turn"
    assert "facts above are authoritative" in merged
    assert "never claim they were unavailable" in merged
    assert history[-1] == (question, True), "hidden context must never pollute user-visible chat history"
    assert monitor.mode2_pending_turn_context == "", "Mode 2 context must be one-shot"

    await process_realtime_input(text_frame("next question"), session, monitor, None)
    second = session.client_sends[1]["turns"].parts[0].text
    assert second == "next question", "consumed context leaked into a later turn"

    guard = "[SILENT GUARD — internal note, do NOT acknowledge: no datapack information for this turn.]"
    await process_realtime_input(
        text_frame(
            guard,
            source="modular_gemini_context",
            is_modular_context=True,
            is_system_context=True,
            silent_response=True,
        ),
        session,
        monitor,
        None,
    )
    monitor.mode2_pending_turn_context_at = time.time() - TTL - 1
    await process_realtime_input(text_frame("after expiry"), session, monitor, None)
    expired = session.client_sends[-1]["turns"].parts[0].text
    assert expired == "after expiry", "expired Mode 2 context must not leak into a future turn"

    # Generic Context Relay frames are deliberately unchanged by this fix.
    generic = "[SYSTEM CONTEXT: Whole datapack]\nordinary relay snapshot"
    await process_realtime_input(
        text_frame(
            generic,
            source="modular_gemini_context",
            is_modular_context=True,
            is_system_context=True,
            silent_response=True,
        ),
        session,
        monitor,
        None,
    )
    assert len(session.system_sends) == 1, "non-Mode2 modular context should keep the existing system-context path"

    print("gemini_mode2_live_context_handoff_smoke: OK")


if __name__ == "__main__":
    asyncio.run(main())
