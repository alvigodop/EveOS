import json
import unittest
from unittest.mock import patch

from server_modules import audioflix_instagram_metadata as metadata


class InstagramOEmbedTests(unittest.TestCase):
    def test_oembed_metadata_promotes_public_author_and_title(self):
        payload = {
            "author_name": "xarzzu",
            "author_url": "https://www.instagram.com/xarzzu/",
            "title": "Original audio",
            "thumbnail_url": "https://cdn.example/thumb.jpg",
            "html": """
                <blockquote class=\"instagram-media\">
                  <a href=\"https://www.instagram.com/reel/DS2r6KBDNCS/\">View this post on Instagram</a>
                  <p>Original audio</p>
                </blockquote>
            """,
        }

        class Response:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return json.dumps(payload).encode("utf-8")

        with patch("server_modules.audioflix_instagram_metadata.urlopen", return_value=Response()):
            result = metadata._oembed_metadata("https://www.instagram.com/p/DS2r6KBDNCS/")

        self.assertEqual(result["creator"], "xarzzu")
        self.assertEqual(result["artist"], "xarzzu")
        self.assertEqual(result["creatorDisplayName"], "xarzzu")
        self.assertEqual(result["metadataSource"], "instagram-oembed")
        self.assertEqual(result["thumbnail"], "https://cdn.example/thumb.jpg")

    def test_resolve_metadata_uses_oembed_before_browser(self):
        oembed = {
            "creator": "xarzzu",
            "creatorDisplayName": "Xarzzu",
            "collaborators": [],
            "audioTitle": "",
            "audioArtist": "",
            "audioKind": "",
            "caption": "Original audio",
            "title": "Original audio — xarzzu",
            "artist": "xarzzu",
            "permalink": "https://www.instagram.com/p/DS2r6KBDNCS/",
            "thumbnail": "",
            "metadataSource": "instagram-oembed",
        }

        with patch("server_modules.audioflix_instagram_metadata._oembed_metadata", return_value=oembed):
            with patch("server_modules.audioflix_instagram_metadata.urlopen", side_effect=AssertionError("oEmbed should be mocked before direct HTTP fallback")):
                result = metadata.resolve_metadata("DS2r6KBDNCS", fallback_url="https://www.instagram.com/p/DS2r6KBDNCS/")

        self.assertTrue(result["ok"])
        self.assertEqual(result["title"], "Original audio — xarzzu")
        self.assertEqual(result["artist"], "xarzzu")
        self.assertEqual(result["creator"], "xarzzu")
        self.assertEqual(result["metadataSource"], "instagram-oembed")


if __name__ == "__main__":
    unittest.main()
