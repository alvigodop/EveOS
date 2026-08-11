"""Exercise the secure Sonic Forge command relay without spending API quota."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
INTERACTIONS = ROOT / "server" / "gemini-backend" / "interactions"
sys.path.insert(0, str(INTERACTIONS))

from main_server_files.api_configuration.model_registry import (  # noqa: E402
    MUSIC_DEFAULT_MODEL,
    music_api_versions,
)
from main_server_files.websocket_server.session_handler.sonic_forge_session import (  # noqa: E402
    _commands,
    _config,
    _prompts,
    _responses,
    execute_sonic_forge_session,
    execute_sonic_forge_with_fallback,
    is_music_api_endpoint_unavailable,
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
    def __init__(self, session, error=None):
        self.session = session
        self.error = error

    async def __aenter__(self):
        if self.error:
            raise self.error
        return self.session

    async def __aexit__(self, *_args):
        return False


class FakeMusicConnector:
    def __init__(self, session, error=None):
        self.session = session
        self.error = error
        self.model = None

    def connect(self, model):
        self.model = model
        return FakeMusicContext(self.session, self.error)


class FakeAsyncClient:
    def __init__(self, session, error=None):
        self.closed = False
        self.live = type("Live", (), {})()
        self.live.music = FakeMusicConnector(session, error)

    async def aclose(self):
        self.closed = True


class FakeMusicClient:
    def __init__(self, session, error=None):
        self.closed = False
        self.aio = FakeAsyncClient(session, error)

    def close(self):
        self.closed = True


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

    assert_true(
        is_music_api_endpoint_unavailable(
            RuntimeError("server rejected WebSocket connection: HTTP 404")
        ),
        "a missing API-version endpoint is eligible for compatibility fallback",
    )
    assert_true(
        not is_music_api_endpoint_unavailable(
            RuntimeError("received 1008: API key not valid")
        ),
        "credential failures never activate API-version fallback",
    )

    versions_created = []
    fallback_clients = []

    def fallback_factory(api_version):
        versions_created.append(api_version)
        error = (
            RuntimeError("server rejected WebSocket connection: HTTP 404")
            if api_version == "v1beta"
            else None
        )
        client = FakeMusicClient(FakeMusicSession(response=False), error)
        fallback_clients.append(client)
        return client

    fallback_monitor = FakeMonitor()
    selected_version = await execute_sonic_forge_with_fallback(
        FakeWebSocket([json.dumps({"type": "sonic_forge_command", "action": "close"})]),
        fallback_monitor,
        MUSIC_DEFAULT_MODEL,
        music_api_versions(),
        fallback_factory,
    )
    assert_true(versions_created == ["v1beta", "v1alpha"],
                "backend fallback is ordered and bounded to one compatibility attempt")
    assert_true(selected_version == "v1alpha",
                "backend reports the endpoint that actually opened")
    assert_true(all(client.closed for client in fallback_clients),
                "every fallback synchronous client is deterministically closed")
    assert_true(all(client.aio.closed for client in fallback_clients),
                "every fallback async client is deterministically closed")
    assert_true(fallback_monitor.sent[0].get("apiVersion") == "v1alpha",
                "ready telemetry exposes the selected compatibility endpoint")

    blocked_versions = []

    def blocked_factory(api_version):
        blocked_versions.append(api_version)
        return FakeMusicClient(
            FakeMusicSession(response=False),
            RuntimeError("received 1008: API key not valid"),
        )

    blocked_monitor = FakeMonitor()
    blocked_result = await execute_sonic_forge_with_fallback(
        FakeWebSocket([]),
        blocked_monitor,
        MUSIC_DEFAULT_MODEL,
        music_api_versions(),
        blocked_factory,
    )
    assert_true(blocked_result == "" and blocked_versions == ["v1beta"],
                "backend does not retry invalid credentials against another endpoint")
    assert_true(blocked_monitor.sent[-1]["type"] == "sonic_forge_error",
                "a final bounded failure reaches the browser once")

    print("SONIC_FORGE_BACKEND_SMOKE_OK")


if __name__ == "__main__":
    asyncio.run(main())
