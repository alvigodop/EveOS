"""Offline contracts for Instagram collection metadata, direct video, and MP4 localization."""

import os
import sys
import tempfile
from pathlib import Path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from server_modules import audioflix_instagram as INSTAGRAM
from server_modules import audioflix_localize as LOCALIZE
from server_modules import audioflix_ytdl as YTDL


def check(condition, message):
    if not condition:
        raise SystemExit("ASSERT FAILED: " + message)


urls = INSTAGRAM.parse_urls(
    "https://instagram.com/reels/Alias_1/?x=1\n"
    "https://www.instagram.com/reel/Alias_1/\n"
    "https://instagram.com/p/Post-2/?utm_source=test"
)
check(urls == [
    "https://www.instagram.com/reel/Alias_1/",
    "https://www.instagram.com/p/Post-2/",
], "Instagram aliases canonicalize and deduplicate")


class FakeYoutubeDL:
    def __init__(self, options):
        self.options = options

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def extract_info(self, url, download=False):
        if self.options.get("format"):
            return {
                "title": "Progressive Reel",
                "duration": 19,
                "formats": [
                    {"url": "https://cdn.example/video-only.mp4", "ext": "mp4", "vcodec": "h264", "acodec": "none", "protocol": "https", "height": 1080},
                    {"url": "https://cdn.example/combined.webm", "ext": "webm", "vcodec": "vp9", "acodec": "opus", "protocol": "https", "height": 1080},
                    {"url": "https://cdn.example/combined.mp4", "ext": "mp4", "vcodec": "h264", "acodec": "aac", "protocol": "https", "height": 720},
                ],
            }
        return {
            "description": ("A detailed Reel caption with spacing. " * 10),
            "uploader": "Drift",
            "thumbnail": "https://cdn.example/reel.jpg",
            "duration": 17,
        }


class FakeYtDlp:
    YoutubeDL = FakeYoutubeDL


original_get_ytdlp = YTDL._get_yt_dlp
YTDL._get_yt_dlp = lambda: FakeYtDlp
try:
    collection = INSTAGRAM.list_collection({"source": "\n".join(urls), "title": "Travel Reels"})
    check(collection.get("ok") and len(collection.get("entries", [])) == 2, "collection metadata returns every URL")
    check(collection.get("title") == "Travel Reels" and collection.get("scrapeSource") == "yt-dlp", "collection keeps title and route provenance")
    check(all(len(entry.get("title", "")) <= 180 for entry in collection["entries"]), "long captions are bounded for Audioflix cards")
    check(collection["entries"][0].get("artist") == "Drift", "Reel uploader metadata is retained")

    video = INSTAGRAM.resolve_video({"url": urls[0]})
    check(video.get("ok"), "direct Reel video resolves")
    check(video.get("videoUrl") == "https://cdn.example/combined.mp4", "direct video chooses one progressive MP4 with audio")
    check(video.get("height") == 720 and video.get("duration") == 19, "selected stream metadata is returned")
finally:
    YTDL._get_yt_dlp = original_get_ytdlp


tmp = Path(tempfile.mkdtemp(prefix="eveos_reel_video_"))
download_calls = []
original_local_get = LOCALIZE._get_yt_dlp
original_download = LOCALIZE._download


def fake_download(_yt_dlp, _url, outtmpl, want_mp3, media_format):
    download_calls.append((want_mp3, media_format))
    path = Path(outtmpl.replace(".%(ext)s", ".mp4"))
    path.write_bytes(b"fake-mp4")
    return {"filepath": str(path), "duration": 12}


LOCALIZE._get_yt_dlp = lambda: object()
LOCALIZE._download = fake_download
try:
    localized = LOCALIZE.localize_one({
        "track": {"id": "reel", "title": "Saved Reel", "url": urls[0]},
        "targetDir": str(tmp),
        "mediaFormat": "video",
    })
    check(localized.get("ok") and localized.get("ext") == "mp4", "Reels can localize as MP4")
    check(localized.get("mediaFormat") == "video", "localization reports the requested media format")
    check(download_calls == [(False, "video")], "video localization uses one merge attempt and never enters MP3 fallback")
finally:
    LOCALIZE._get_yt_dlp = original_local_get
    LOCALIZE._download = original_download


bridge_source = Path(ROOT, "server_modules", "audioflix_bridge.py").read_text(encoding="utf-8")
check("/api/audioflix/instagram-collection" in bridge_source, "bridge registers Instagram collection metadata")
check("/api/audioflix/instagram-video" in bridge_source, "bridge registers direct Instagram video")

print("AUDIOFLIX_INSTAGRAM_BACKEND_SMOKE_OK")
