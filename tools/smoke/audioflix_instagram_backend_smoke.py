"""Offline contracts for Instagram collection metadata, direct video, and MP4 localization."""

import os
import sys
import tempfile
from pathlib import Path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from server_modules import audioflix_instagram as INSTAGRAM
from server_modules import audioflix_instagram_browser as INSTAGRAM_BROWSER
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

    class FailingYoutubeDL(FakeYoutubeDL):
        def extract_info(self, url, download=False):
            raise RuntimeError("Instagram sent an empty media response")

    class FailingYtDlp:
        YoutubeDL = FailingYoutubeDL

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return (
                b'<html><head>'
                b'<meta property="og:title" content="Instagram Post Video">'
                b'<meta property="og:video" content="https://cdn.example/post-video.mp4">'
                b'<meta property="og:image" content="https://cdn.example/post.jpg">'
                b'</head></html>'
            )

    # Verify resolver fallback ladder: yt-dlp -> Camofox -> Lightpanda -> Webpage metadata
    original_camofox = INSTAGRAM_BROWSER.extract_camofox_video
    original_lightpanda = INSTAGRAM_BROWSER.extract_lightpanda_video
    YTDL._get_yt_dlp = lambda: FailingYtDlp
    INSTAGRAM_BROWSER.extract_camofox_video = lambda _url: {
        "ok": True,
        "videoUrl": "https://cdn.example/camofox-video.mp4",
        "title": "Camofox Hydrated Video",
        "thumbnail": "https://cdn.example/camofox-thumb.jpg",
        "source": "camofox-browser",
    }
    try:
        cf_res = INSTAGRAM.resolve_video({"url": "https://www.instagram.com/p/DS2r6KBDNCS/"})
        check(cf_res.get("ok"), "yt-dlp failure falls back to Camofox browser extraction")
        check(cf_res.get("videoUrl") == "https://cdn.example/camofox-video.mp4", "Camofox video URL returned")
        check(cf_res.get("source") == "camofox-browser", "Camofox source identified")
    finally:
        INSTAGRAM_BROWSER.extract_camofox_video = original_camofox

    INSTAGRAM_BROWSER.extract_camofox_video = lambda _url: {"ok": False, "reason": "No video"}
    INSTAGRAM_BROWSER.extract_lightpanda_video = lambda _url: {
        "ok": True,
        "videoUrl": "https://cdn.example/lightpanda-video.mp4",
        "title": "Lightpanda Rendered Video",
        "thumbnail": "https://cdn.example/lightpanda-thumb.jpg",
        "source": "lightpanda-browser",
    }
    try:
        lp_res = INSTAGRAM.resolve_video({"url": "https://www.instagram.com/p/DS2r6KBDNCS/"})
        check(lp_res.get("ok"), "Camofox failure falls back to Lightpanda browser extraction")
        check(lp_res.get("videoUrl") == "https://cdn.example/lightpanda-video.mp4", "Lightpanda video URL returned")
        check(lp_res.get("source") == "lightpanda-browser", "Lightpanda source identified")
    finally:
        INSTAGRAM_BROWSER.extract_camofox_video = original_camofox
        INSTAGRAM_BROWSER.extract_lightpanda_video = original_lightpanda

    INSTAGRAM_BROWSER.extract_camofox_video = lambda _url: {"ok": False, "reason": "No video"}
    INSTAGRAM_BROWSER.extract_lightpanda_video = lambda _url: {"ok": False, "reason": "No video"}
    original_urlopen = INSTAGRAM.urlopen
    INSTAGRAM.urlopen = lambda *_args, **_kwargs: FakeResponse()
    try:
        post_video = INSTAGRAM.resolve_video({"url": "https://www.instagram.com/p/PostVideo/"})
        check(post_video.get("ok"), "video Instagram /p/ post resolves through webpage fallback")
        check(post_video.get("videoUrl") == "https://cdn.example/post-video.mp4", "post fallback returns direct video URL")
        check(post_video.get("source") == "instagram-webpage", "post fallback identifies webpage source")
        check(post_video.get("title") == "Instagram Post Video", "post fallback retains og:title")
    finally:
        INSTAGRAM.urlopen = original_urlopen
        INSTAGRAM_BROWSER.extract_camofox_video = original_camofox
        INSTAGRAM_BROWSER.extract_lightpanda_video = original_lightpanda
        YTDL._get_yt_dlp = lambda: FakeYtDlp

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as handle:
        cookie_path = handle.name
        handle.write("# Netscape HTTP Cookie File\n")
        handle.write(".instagram.com\tTRUE\t/\tTRUE\t2147483647\tcsrftoken\tfake-csrf\n")
        handle.write(".instagram.com\tTRUE\t/\tTRUE\t2147483647\tsessionid\tfake-session\n")
    try:
        os.environ["EVEOS_INSTAGRAM_COOKIES"] = cookie_path
        os.environ.pop("EVEOS_INSTAGRAM_COOKIES_BROWSER", None)
        options = INSTAGRAM._ydl_options()
        check(options.get("cookiefile") == cookie_path, "explicit Instagram cookie file is honored by yt-dlp")
        imported = INSTAGRAM_BROWSER._instagram_cookie_entries("https://www.instagram.com/p/DS2r6KBDNCS/")
        check(len(imported) == 2, "explicit Instagram cookie file imports into Camofox")
        check(imported[1].get("name") == "sessionid" and imported[1].get("value") == "fake-session", "Camofox receives cookie name/value")
    finally:
        os.environ.pop("EVEOS_INSTAGRAM_COOKIES", None)
        os.environ.pop("EVEOS_INSTAGRAM_COOKIES_BROWSER", None)
        try:
            os.remove(cookie_path)
        except OSError:
            pass

    os.environ["EVEOS_INSTAGRAM_COOKIES_BROWSER"] = "edge:Default"
    options = INSTAGRAM._ydl_options()
    check(options.get("cookiesfrombrowser") == ("edge", "Default", None, None), "browser cookie configuration is translated correctly")
finally:
    os.environ.pop("EVEOS_INSTAGRAM_COOKIES", None)
    os.environ.pop("EVEOS_INSTAGRAM_COOKIES_BROWSER", None)
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