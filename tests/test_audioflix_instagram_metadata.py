import unittest
from unittest.mock import patch

from server_modules import audioflix_instagram
from server_modules import audioflix_instagram_metadata
from server_modules import audioflix_instagram_public


class InstagramMetadataTests(unittest.TestCase):
    def test_supported_url_shapes_normalize_to_same_shortcode(self):
        shapes = [
            ("https://www.instagram.com/p/DS2r6KBDNCS/", "https://www.instagram.com/p/DS2r6KBDNCS/", "DS2r6KBDNCS"),
            ("https://www.instagram.com/reel/DS2r6KBDNCS/", "https://www.instagram.com/reel/DS2r6KBDNCS/", "DS2r6KBDNCS"),
            ("https://www.instagram.com/reels/DS2r6KBDNCS/", "https://www.instagram.com/reel/DS2r6KBDNCS/", "DS2r6KBDNCS"),
            ("https://www.instagram.com/tv/DS2r6KBDNCS/", "https://www.instagram.com/tv/DS2r6KBDNCS/", "DS2r6KBDNCS"),
        ]
        for raw, canonical, shortcode in shapes:
            parsed = audioflix_instagram.parse_urls(raw)
            self.assertEqual(parsed, [canonical])
            self.assertEqual(audioflix_instagram._code(parsed[0]), shortcode)
        value = " ".join(raw for raw, _, _ in shapes)
        urls = audioflix_instagram.parse_urls(value)
        self.assertEqual(len(urls), 3)
        self.assertEqual({audioflix_instagram._code(url) for url in urls}, {"DS2r6KBDNCS"})

    def test_catalog_music_wins_over_creator_fallback(self):
        media = {
            "user": {"username": "xarzzu", "full_name": "Xarzzu"},
            "caption": {"text": "caption"},
            "music_metadata": {"music_info": {"music_asset_info": {
                "title": "Catalog Track",
                "display_artist": "Actual Artist",
            }}},
        }
        metadata = audioflix_instagram_public._metadata_from_media(media)
        self.assertEqual(metadata["title"], "Catalog Track")
        self.assertEqual(metadata["artist"], "Actual Artist")
        self.assertEqual(metadata["creator"], "xarzzu")

    def test_original_audio_uses_creator_when_catalog_music_is_missing(self):
        media = {"user": {"username": "xarzzu", "full_name": "Xarzzu"}, "audio_type": "original_audio"}
        metadata = audioflix_instagram_public._metadata_from_media(media)
        self.assertEqual(metadata["title"], "Original audio — xarzzu")
        self.assertEqual(metadata["artist"], "xarzzu")
        self.assertEqual(metadata["audioKind"], "original_audio")

    def test_embed_visible_text_provides_creator_and_original_audio_fallback(self):
        page = """
        <blockquote class="instagram-media">
          <a href="https://www.instagram.com/reel/DS2r6KBDNCS/">View this post on Instagram</a>
          <p>A post shared by Xarzzu (@xarzzu)</p>
          <span>Original audio</span>
        </blockquote>
        """
        metadata = audioflix_instagram_metadata._metadata_from_html(page)
        self.assertEqual(metadata["creator"], "xarzzu")
        self.assertEqual(metadata["creatorDisplayName"], "Xarzzu")
        self.assertEqual(metadata["title"], "Original audio — xarzzu")
        self.assertEqual(metadata["artist"], "xarzzu")
        self.assertEqual(metadata["audioKind"], "original_audio")

    def test_collaborators_are_normalized(self):
        media = {
            "user": {"username": "owner"},
            "coauthor_producers": {"edges": [
                {"node": {"username": "First"}},
                {"node": {"username": "Second"}},
                {"node": {"username": "First"}},
            ]},
        }
        metadata = audioflix_instagram_public._metadata_from_media(media)
        self.assertEqual(metadata["collaborators"], ["first", "second"])

    def test_resolve_metadata_falls_back_to_browser_rendered_embed(self):
        rendered_html = """
        <blockquote class="instagram-media">
          <a href="https://www.instagram.com/reel/DS2r6KBDNCS/">View this post on Instagram</a>
          <p>A post shared by Xarzzu (@xarzzu)</p>
          <span>Original audio</span>
        </blockquote>
        """
        with patch("server_modules.audioflix_instagram_public._graphql", return_value=None):
            with patch("server_modules.audioflix_instagram_public._request", return_value=b"<html><title>Instagram</title></html>"):
                with patch("server_modules.audioflix_instagram_browser.render_instagram_html", return_value=rendered_html):
                    metadata = audioflix_instagram_metadata.resolve_metadata("DS2r6KBDNCS")

        self.assertTrue(metadata["ok"])
        self.assertEqual(metadata["creator"], "xarzzu")
        self.assertEqual(metadata["creatorDisplayName"], "Xarzzu")
        self.assertEqual(metadata["title"], "Original audio — xarzzu")
        self.assertEqual(metadata["artist"], "xarzzu")
        self.assertEqual(metadata["audioKind"], "original_audio")

    def test_collection_public_fallback_entry_is_metadata_enriched(self):
        public_result = {
            "ok": True,
            "videoUrl": "https://cdn.example/video.mp4",
            "title": "Instagram Video",
            "artist": "Instagram",
            "duration": 49,
            "thumbnail": "",
        }
        metadata = {
            "ok": True,
            "title": "Original audio — xarzzu",
            "artist": "xarzzu",
            "creator": "xarzzu",
            "audioKind": "original_audio",
        }
        class FailingYtDlp:
            class YoutubeDL:
                def __init__(self, *args, **kwargs): pass
                def __enter__(self): return self
                def __exit__(self, *args): return False
                def extract_info(self, *args, **kwargs):
                    raise RuntimeError("empty media response")

        with patch("server_modules.audioflix_ytdl._get_yt_dlp", return_value=FailingYtDlp):
            with patch("server_modules.audioflix_instagram_public.resolve_public", return_value=public_result):
                with patch("server_modules.audioflix_instagram_metadata.resolve_metadata", return_value=metadata):
                    result = audioflix_instagram.list_collection({"source": "https://www.instagram.com/p/DS2r6KBDNCS/"})

        self.assertTrue(result["ok"])
        entry = result["entries"][0]
        self.assertEqual(entry["title"], "Original audio — xarzzu")
        self.assertEqual(entry["artist"], "xarzzu")
        self.assertEqual(entry["creator"], "xarzzu")
        self.assertEqual(entry["audioKind"], "original_audio")
        self.assertEqual(entry["duration"], 49)

    def test_browser_metadata_failure_preserves_playable_video(self):
        playable = {"ok": True, "videoUrl": "https://cdn.example/video.mp4", "title": "Instagram Video"}
        with patch.object(audioflix_instagram, "RESOLVER_PROVIDERS", [lambda url, shortcode: playable]):
            with patch("server_modules.audioflix_instagram_public._graphql", return_value=None):
                with patch("server_modules.audioflix_instagram_public._request", side_effect=RuntimeError("HTTP failed")):
                    with patch("server_modules.audioflix_instagram_browser.render_instagram_html", side_effect=RuntimeError("Browser crashed")):
                        result = audioflix_instagram.resolve_video({"url": "https://www.instagram.com/reel/DS2r6KBDNCS/"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["videoUrl"], playable["videoUrl"])
        self.assertEqual(result["title"], "Instagram Video")


if __name__ == "__main__":
    unittest.main()
