"""audioflix_localize_endpoint_smoke.py

Server-side localization module (server_modules/audioflix_localize.py) pure-logic checks — no
network, no yt-dlp, no ffmpeg needed:
  1. safe_filename strips path-hostile characters and bounds length.
  2. _is_http guards non-URL sources.
  3. scan_dir lists only audio files in a folder (for the reimport music port).
  4. localize_one fails cleanly (no crash) on a non-online url and on a missing target folder.
  5. The bridge POST router exposes the /api/audioflix/localize + /localize-scan routes.
"""
import os
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from server_modules import audioflix_localize as L


def check(cond, msg):
    if not cond:
        raise SystemExit("ASSERT FAILED: " + msg)


# 1. safe_filename
check(L.safe_filename('AC/DC: Back "Home" *?') == 'ACDC Back Home', "safe_filename strips invalid chars")
check(L.safe_filename('') == 'track', "safe_filename falls back")
check(len(L.safe_filename('x' * 400)) <= 120, "safe_filename bounds length")

# 2. _is_http
check(L._is_http('https://youtube.com/x') and L._is_http('http://a/b'), "_is_http accepts http(s)")
check(not L._is_http('C:/music/song.mp3') and not L._is_http(''), "_is_http rejects local paths")

# 3. scan_dir
tmp = tempfile.mkdtemp(prefix="eveos_localize_")
open(os.path.join(tmp, "Night Drive.mp3"), "w").close()
open(os.path.join(tmp, "Focus.m4a"), "w").close()
open(os.path.join(tmp, "notes.txt"), "w").close()
scan = L.scan_dir({"dir": tmp})
check(scan.get("ok") and scan.get("count") == 2, "scan_dir lists the two audio files only")
names = sorted(f["name"] for f in scan["files"])
check(names == ["Focus", "Night Drive"], "scan_dir returns extension-less names: %r" % names)
check(all(os.path.isabs(f["path"]) for f in scan["files"]), "scan_dir returns absolute paths")

miss = L.scan_dir({"dir": os.path.join(tmp, "nope")})
check(not miss.get("ok"), "scan_dir reports a missing folder")

# 4. localize_one guards (no network hit on either path)
r_local = L.localize_one({"track": {"id": "x", "title": "T", "url": "C:/song.mp3"}, "targetDir": tmp})
check(not r_local.get("ok") and "online" in (r_local.get("error") or "").lower(), "localize_one rejects a non-online url")
r_nodir = L.localize_one({"track": {"id": "y", "title": "T", "url": "https://example.com/x"}, "targetDir": ""})
check(not r_nodir.get("ok"), "localize_one rejects a missing target folder before any download")

# 5. bridge route wiring
from server_modules import audioflix_bridge as B
check(callable(getattr(B, "localize_track", None)), "bridge exposes localize_track")
check(callable(getattr(B, "localize_scan", None)), "bridge exposes localize_scan")
src = open(os.path.join(ROOT, "server_modules", "audioflix_bridge.py"), encoding="utf-8").read()
check("/api/audioflix/localize" in src and "/api/audioflix/localize-scan" in src, "bridge POST map registers both routes")

print("AUDIOFLIX_LOCALIZE_ENDPOINT_SMOKE_OK")
