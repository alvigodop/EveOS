import json
import sys
import tempfile
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules import audioflix_spotify as spotify


PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DX4WYpdgoIcn6"


class RunningProcess:
    def poll(self):
        return None


def fake_launch(command, **_kwargs):
    Path(command[-1]).write_text(
        json.dumps({"ok": True, "pid": 12345, "openedAt": 1}),
        encoding="utf-8",
    )
    return RunningProcess()


with tempfile.TemporaryDirectory() as temp:
    profile = Path(temp) / "spotify-browser-profile"
    profile.mkdir()
    spotify._session_process = None
    with mock.patch.object(spotify, "_profile_dir", return_value=profile), \
            mock.patch.object(spotify.subprocess, "Popen", side_effect=fake_launch):
        result = spotify.open_session(PLAYLIST)

assert result["ok"] is True
assert result["sessionReady"] is True
assert "separate saved Edge profile" in result["message"]

print("AUDIOFLIX_SPOTIFY_SESSION_SMOKE_OK")
