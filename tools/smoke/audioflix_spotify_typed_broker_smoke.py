"""Typed remote entities cross the real broker without touching a managed profile."""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from server_modules import audioflix_spotify_broker as mod
from server_modules.audioflix_spotify_media_identity import parse_media, media_from_payload

ID = "1" * 22
ARTIFACT = ROOT / "data/runtime/smoke-results/audioflix-spotify-typed-broker.json"
evidence = {"ok": False, "cases": []}
current = "startup"


class FakeEngine:
    def __init__(self):
        self.calls = []
        self.state = {"status": "paused", "spotifyId": "", "generation": 0, "paused": True}

    def status(self):
        return {"ok": True, "helperReachable": True, "engineStartedAt": 1000,
                "browserRunning": True, "transport": dict(self.state)}

    def ensure_engine(self, url):
        self.calls.append(("ensure", url))
        return self.status()

    def transport(self, payload):
        self.calls.append(("transport", dict(payload)))
        if payload["action"] == "load":
            self.state.update({key: payload[key] for key in ("spotifyId", "spotifyUri", "mediaType", "generation")})
        self.state.update(status="playing" if payload["action"] == "play" else "loaded", paused=payload["action"] != "play")
        return {"ok": True, "state": dict(self.state)}

    def volume(self, gain, identity="", **_kwargs):
        self.calls.append(("volume", identity))
        return {"ok": True, "volume": gain}


def run():
    global current
    current = "strict-parser"
    assert parse_media(ID)["spotifyUri"] == f"spotify:track:{ID}"
    assert parse_media(f"https://open.spotify.com/embed/episode/{ID}?si=test")["mediaType"] == "episode"
    for value in (f"spotify:local:artist:album:{ID}", f"prefix-{ID}", f"https://evil.invalid/track/{ID}"):
        assert parse_media(value) is None
    assert media_from_payload({"spotifyUri": f"spotify:episode:{ID}", "mediaType": "track"}) is None
    assert media_from_payload({"spotifyUri": f"spotify:episode:{ID}", "spotifyTrackId": ID}) is None
    evidence["cases"].append(current)
    fake = FakeEngine()
    with patch.object(mod.engine, "status", fake.status), patch.object(mod.engine, "ensure_engine", fake.ensure_engine), \
            patch.object(mod.engine, "transport", fake.transport), patch.object(mod.engine, "set_effective_volume", fake.volume), \
            patch.object(mod.engine, "interrupt", return_value={"ok": False}):
        broker = mod.SpotifyClientBroker()
        context = {"serverOrigin": "http://127.0.0.1:8765"}
        grant = broker.connect({"mode": "localhost", "parentOrigin": context["serverOrigin"], "documentId": "typed-fixture"}, context)
        assert grant["ok"]
        sequence = 0

        def command(action, payload):
            nonlocal sequence
            sequence += 1
            return broker.command({"clientToken": grant["clientToken"], "command": {
                "connectionId": grant["connectionId"], "action": action, "payload": payload,
                "commandId": str(uuid.uuid4()), "clientCommandSeq": sequence}}, context)

        for kind in ("track", "episode"):
            current = f"{kind}-load-volume-play"
            result = command("play", {"spotifyId": ID, "spotifyUri": f"spotify:{kind}:{ID}", "mediaType": kind})
            assert result["ok"], result
            load = next(call[1] for call in reversed(fake.calls) if call[0] == "transport" and call[1]["action"] == "load")
            assert load["spotifyUri"] == f"spotify:{kind}:{ID}" and load["mediaType"] == kind
            assert fake.calls[-2] == ("volume", f"spotify:{kind}:{ID}")
            evidence["cases"].append(current)
        current = "legacy-track-and-direct-episode"
        assert command("play", {"spotifyId": ID})["ok"]
        assert fake.state["spotifyUri"] == f"spotify:track:{ID}"
        assert command("play", {"url": f"https://open.spotify.com/episode/{ID}"})["ok"]
        assert fake.state["spotifyUri"] == f"spotify:episode:{ID}"
        evidence["cases"].append(current)
        current = "local-and-conflict-no-engine-mutation"
        for invalid in ({"spotifyId": ID, "mediaType": "local"},
                        {"spotifyUri": f"spotify:episode:{ID}", "mediaType": "track"}):
            before = len(fake.calls)
            assert not command("play", invalid)["ok"]
            assert len(fake.calls) == before
        evidence["cases"].append(current)
        current = "volume-namespace-fence"
        markers = {"ownerEpoch": broker._owner_epoch, "engineEpoch": broker._engine_epoch,
                   "trackGeneration": fake.state["generation"]}
        before = len(fake.calls)
        rejected = command("volume", {**markers, "spotifyId": ID, "spotifyUri": f"spotify:track:{ID}", "mediaType": "track"})
        assert rejected.get("resyncRequired") and not rejected["ok"]
        assert len(fake.calls) == before
        assert command("volume", {**markers, "spotifyId": ID, "spotifyUri": f"spotify:episode:{ID}", "mediaType": "episode"})["ok"]
        assert fake.calls[-1] == ("volume", f"spotify:episode:{ID}")
        evidence["cases"].append(current)
        current = "invalid-volume-aliases-no-mutation"
        for key in ("url", "sourceUri", "sourceMediaId", "spotifyTrackId", "sourceMediaType"):
            before = len(fake.calls)
            assert not command("volume", {key: "spotify:local:artist:album:title:1", "effectiveVolume": .2})["ok"]
            assert len(fake.calls) == before
        before = len(fake.calls)
        assert not command("volume", {"sourceIsLocal": True, "effectiveVolume": .2})["ok"]
        assert len(fake.calls) == before
        evidence["cases"].append(current)
        current = "all-type-hints-consistent"
        for hint in ("episode", "local"):
            assert media_from_payload({"spotifyId": ID, "mediaType": "track", "sourceMediaType": hint}) is None
        evidence["cases"].append(current)
    evidence["ok"] = True


try:
    run()
except Exception:
    import traceback
    evidence["error"] = {"id": current, "stack": traceback.format_exc()}
    print(f"AUDIOFLIX_SPOTIFY_TYPED_BROKER_FAIL {current} artifact={ARTIFACT}", file=sys.stderr)
    print("\n".join(evidence["error"]["stack"].splitlines()[-30:]), file=sys.stderr)
finally:
    ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
    ARTIFACT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
if not evidence["ok"]:
    raise SystemExit(1)
print(f"AUDIOFLIX_SPOTIFY_TYPED_BROKER_OK {len(evidence['cases'])}/{len(evidence['cases'])}")
