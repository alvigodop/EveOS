"""Ensure delayed native PCM never bursts into playback after an endpoint stall."""

from __future__ import annotations

import base64
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules import audioflix_bridge_playback as playback


class FakePlayer:
    def __init__(self) -> None:
        self.blocks = []

    def enqueue(self, samples, stream_id=None) -> None:
        self.blocks.append((samples.copy(), stream_id))


def main() -> None:
    player = FakePlayer()
    original_sd, original_np = playback.sd, playback.np
    original_player_for = playback._player_for
    playback.sd = object()
    playback.np = np

    try:
        def delayed_player(*_args):
            time.sleep(0.025)
            return player

        playback._player_for = delayed_player
        expired = playback._enqueue_mono(
            'sd:1', 24000, np.ones(16, dtype='float32'), 'pcm',
            expires_at_ms=(time.time() * 1000) + 2,
        )
        assert expired.get('stale') is True
        assert not player.blocks

        playback._player_for = lambda *_args: player
        raw = np.array([1000, -1000], dtype='<i2').tobytes()
        stale_payload = playback.play_pcm({
            'audio': base64.b64encode(raw).decode('ascii'),
            'deviceId': 'sd:1',
            'sampleRate': 24000,
            'channels': 1,
            'sentAtMs': (time.time() * 1000) - 2000,
            'maxAgeMs': 1200,
        })
        assert stale_payload.get('stale') is True
        assert not player.blocks

        fresh_payload = playback.play_pcm({
            'audio': base64.b64encode(raw).decode('ascii'),
            'deviceId': 'sd:1',
            'sampleRate': 24000,
            'channels': 1,
            'sentAtMs': time.time() * 1000,
            'maxAgeMs': 1200,
        })
        assert fresh_payload.get('ok') is True
        assert len(player.blocks) == 1
    finally:
        playback.sd, playback.np = original_sd, original_np
        playback._player_for = original_player_for

    print('AUDIOFLIX_NATIVE_PCM_FRESHNESS_SMOKE_OK')


if __name__ == '__main__':
    main()
