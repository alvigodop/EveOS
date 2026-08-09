"""Gemini model, Live-session, native-transcript, and usage contract smoke."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[2]
INTERACTIONS = ROOT / "server" / "gemini-backend" / "interactions"
if str(INTERACTIONS) not in sys.path:
    sys.path.insert(0, str(INTERACTIONS))

from main_server_files.api_configuration.gemini_config import (  # noqa: E402
    TEXT_BRAIN_CONFIG,
    TRANSCRIPTION_CONFIG,
    TimeoutConfig,
    create_gemini_config,
)
from main_server_files.api_configuration.model_registry import (  # noqa: E402
    LIVE_DEFAULT_MODEL,
    TEXT_BRAIN_DEFAULT_MODEL,
    TRANSCRIPTION_DEFAULT_MODEL,
    model_capabilities,
    model_options,
    resolve_live_model,
    resolve_text_brain_model,
    resolve_transcription_model,
)
from main_server_files.response_processing.stream_handling.response_parser import (  # noqa: E402
    _receive_responses,
)


def assert_model_contract() -> None:
    assert LIVE_DEFAULT_MODEL == "gemini-3.1-flash-live-preview"
    assert TEXT_BRAIN_DEFAULT_MODEL == "gemini-3.5-flash-lite"
    assert TRANSCRIPTION_DEFAULT_MODEL == "gemini-3.6-flash"
    assert resolve_live_model("gemini-2.5-flash-native-audio-latest") == LIVE_DEFAULT_MODEL
    assert resolve_text_brain_model("gemini-2.5-pro") == "gemini-3.6-flash"
    assert resolve_transcription_model("gemini-2.0-flash") == TRANSCRIPTION_DEFAULT_MODEL
    assert resolve_live_model("unknown") == LIVE_DEFAULT_MODEL
    assert len(model_options("live")) == 2
    assert model_capabilities("live", LIVE_DEFAULT_MODEL)["output_audio_transcription"] is True

    forbidden_sampling = {"temperature", "top_k", "top_p"}
    assert not forbidden_sampling.intersection(TEXT_BRAIN_CONFIG)
    assert not forbidden_sampling.intersection(TRANSCRIPTION_CONFIG)
    assert TimeoutConfig.CLIENT_TIMEOUT_SECONDS == 300
    assert TimeoutConfig.CLIENT_TIMEOUT_MS == 300_000

    live_config = create_gemini_config(
        model_name="gemini-2.5-flash-native-audio-latest",
        enable_input_transcription=False,
        enable_output_transcription=True,
    )
    assert "output_audio_transcription" in live_config
    assert "input_audio_transcription" not in live_config
    assert live_config["response_modalities"] == ["AUDIO"]


def assert_source_contract() -> None:
    requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8")
    assert "google-genai==2.13.0" in requirements
    assert "google-generativeai" not in requirements

    session_loop = (
        INTERACTIONS
        / "main_server_files/websocket_server/session_handler/session_loop.py"
    ).read_text(encoding="utf-8")
    assert session_loop.count("async with client.aio.live.connect") == 1
    assert "await client.aio.live.connect" not in session_loop
    assert "outputTranscriptionEnabled" in session_loop
    assert "enable_input_transcription=False" in session_loop

    retired = [
        "main_server_files/server_initialization/reconnection_handler.py",
        "main_server_files/session_management/core/session_factory.py",
        "main_server_files/session_management/gemini_session_initializer.py",
        "main_server_files/websocket_server/message_processing/session_reinitializer.py",
    ]
    assert all(not (INTERACTIONS / relative).exists() for relative in retired)


class FakeConnectionMonitor:
    model_name = LIVE_DEFAULT_MODEL

    def __init__(self) -> None:
        self.messages: list[dict] = []

    def is_websocket_open(self) -> bool:
        return True

    async def safe_send(self, raw: str) -> None:
        self.messages.append(json.loads(raw))


class FakeResponseHandler:
    def __init__(self) -> None:
        self.parts: list[object] = []
        self.transcripts: list[str] = []
        self.completed = 0

    async def process_response_part(self, part: object) -> None:
        self.parts.append(part)

    async def process_transcription_response(self, text: str) -> None:
        self.transcripts.append(text)

    async def handle_turn_complete(self) -> None:
        self.completed += 1

    async def check_audio_completion(self) -> bool:
        return False


class FakeSession:
    def __init__(self, responses: list[object]) -> None:
        self.responses = responses

    async def receive(self):
        for response in self.responses:
            yield response


async def assert_parser_contract() -> None:
    usage_one = SimpleNamespace(
        prompt_token_count=10,
        response_token_count=4,
        cached_content_token_count=2,
        total_token_count=14,
    )
    usage_two = SimpleNamespace(
        prompt_token_count=10,
        response_token_count=7,
        cached_content_token_count=2,
        total_token_count=17,
    )
    responses = [
        SimpleNamespace(
            usage_metadata=usage_one,
            server_content=SimpleNamespace(
                output_transcription=SimpleNamespace(text="EveOS keeps"),
                model_turn=SimpleNamespace(parts=[SimpleNamespace(text="part-a"), SimpleNamespace(inline_data=b"a")]),
                turn_complete=False,
            ),
        ),
        SimpleNamespace(
            usage_metadata=usage_two,
            server_content=SimpleNamespace(
                output_transcription=SimpleNamespace(text="EveOS keeps one transcript"),
                model_turn=SimpleNamespace(parts=[SimpleNamespace(inline_data=b"b")]),
                turn_complete=True,
            ),
        ),
    ]
    monitor = FakeConnectionMonitor()
    handler = FakeResponseHandler()
    await _receive_responses(FakeSession(responses), handler, monitor, "smoke")

    assert len(handler.parts) == 3
    assert handler.transcripts == ["EveOS keeps one transcript"]
    assert handler.completed == 1
    usage_messages = [message for message in monitor.messages if message.get("type") == "live_usage"]
    assert len(usage_messages) == 2
    assert len({message["turnId"] for message in usage_messages}) == 1
    assert usage_messages[-1]["usage"]["total"] == 17


def main() -> None:
    assert_model_contract()
    assert_source_contract()
    asyncio.run(assert_parser_contract())
    print("GEMINI_RUNTIME_CONTRACT_SMOKE_OK")


if __name__ == "__main__":
    main()
