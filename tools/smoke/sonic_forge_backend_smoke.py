"""Exercise the secure Sonic Forge command relay without spending API quota."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
INTERACTIONS = ROOT / "server" / "gemini-backend" / "interactions"
sys.path.insert(0, str(INTERACTIONS))

from main_server_files.api_configuration.model_registry import MUSIC_DEFAULT_MODEL  # noqa: E402
from main_server_files.websocket_server.session_handler.sonic_forge_session import (  # noqa: E402
    _commands,
    _config,
    _prompts,
    _responses,
    execute_sonic_forge_session,
)


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(f"ASSERT FAILED: {message}")


class FakeWebSocket:
    def __init__(self, messages):
        self.messages = iter(messages)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self.messages)
        except StopIteration as error:
            raise StopAsyncIteration from error


class FakeMessage:
    def model_dump(self, **options):
        assert_true(options.get("by_alias") is True, "responses use browser-facing aliases")
        assert_true(options.get("mode") == "json", "responses are JSON serializable")
        return {"serverContent": {"audioChunks": [{"data": "__8"}]}}


class FakeMusicSession:
    def __init__(self, response=True):
        self.calls = []
        self.response = response

    async def set_weighted_prompts(self, prompts):
        self.calls.append(("prompts", prompts))

    async def set_music_generation_config(self, config):
        self.calls.append(("config", config))

    async def play(self):
        self.calls.append(("play", None))

    async def pause(self):
        self.calls.append(("pause", None))

    async def stop(self):
        self.calls.append(("stop", None))

    async def reset_context(self):
        self.calls.append(("reset", None))

    async def receive(self):
        if self.response:
            yield FakeMessage()
        else:
            await asyncio.Event().wait()


class FakeMonitor:
    def __init__(self):
        self.sent = []

    def is_websocket_open(self):
        return True

    async def safe_send(self, payload):
        self.sent.append(json.loads(payload))


class FakeMusicContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *_args):
        return False


class FakeMusicConnector:
    def __init__(self, session):
        self.session = session
        self.model = None

    def connect(self, model):
        self.model = model
        return FakeMusicContext(self.session)


async def main() -> None:
    prompts = _prompts([{"text": "ambient", "weight": "not-a-number"}])
    assert_true(prompts[0].text == "ambient" and prompts[0].weight == 1.0,
                "invalid prompt weights normalize without closing the session")
    assert_true(_prompts([])[0].text == "ambient instrumental music",
                "an empty prompt list receives a safe default")

    config = _config({"topK": 64, "bpm": 90, "unknown": "discard"})
    assert_true(config.top_k == 64 and config.bpm == 90,
                "supported steering aliases reach the SDK config")
    assert_true(not hasattr(config, "unknown"), "unknown config fields are discarded")

    commands = FakeWebSocket([
        "{bad-json",
        "[]",
        json.dumps({"type": "other"}),
        json.dumps({"type": "sonic_forge_command", "action": "set_weighted_prompts",
                    "prompts": [{"text": "piano", "weight": 1.2}]}),
        json.dumps({"type": "sonic_forge_command", "action": "set_music_generation_config",
                    "config": {"density": 0.4}}),
        json.dumps({"type": "sonic_forge_command", "action": "play"}),
        json.dumps({"type": "sonic_forge_command", "action": "pause"}),
        json.dumps({"type": "sonic_forge_command", "action": "stop"}),
        json.dumps({"type": "sonic_forge_command", "action": "reset_context"}),
        json.dumps({"type": "sonic_forge_command", "action": "close"}),
    ])
    session = FakeMusicSession()
    await _commands(commands, session)
    assert_true([name for name, _value in session.calls] ==
                ["prompts", "config", "play", "pause", "stop", "reset"],
                "valid commands remain ordered after malformed input is ignored")

    monitor = FakeMonitor()
    await _responses(FakeMusicSession(), monitor)
    assert_true(monitor.sent[0]["type"] == "sonic_forge_message",
                "music responses return through the relay envelope")
    assert_true(
        monitor.sent[0]["message"]["serverContent"]["audioChunks"][0]["data"] == "//8=",
        "Python Base64URL PCM is normalized for browser atob consumers",
    )

    relay_session = FakeMusicSession(response=False)
    connector = FakeMusicConnector(relay_session)
    client = type("Client", (), {})()
    client.aio = type("Aio", (), {})()
    client.aio.live = type("Live", (), {})()
    client.aio.live.music = connector
    ready_monitor = FakeMonitor()
    await execute_sonic_forge_session(
        FakeWebSocket([json.dumps({"type": "sonic_forge_command", "action": "close"})]),
        client,
        ready_monitor,
        "expired-model",
    )
    assert_true(connector.model == MUSIC_DEFAULT_MODEL, "unknown music models resolve safely")
    assert_true(ready_monitor.sent[0]["type"] == "sonic_forge_ready",
                "the relay announces readiness only after its music context opens")

    print("SONIC_FORGE_BACKEND_SMOKE_OK")


if __name__ == "__main__":
    asyncio.run(main())
