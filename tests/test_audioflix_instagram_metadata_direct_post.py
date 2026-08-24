import unittest
from unittest.mock import patch

from server_modules import audioflix_instagram_metadata


class InstagramDirectPostMetadataTests(unittest.TestCase):
    def test_direct_post_render_is_used_after_anonymous_embed_shell(self):
        rendered = """
        <html><body>
          <p>A post shared by Xarzzu (@xarzzu)</p>
          <span>Original audio</span>
        </body></html>
        """
        calls = []

        def render(target):
            calls.append(target)
            if target == "https://www.instagram.com/p/DS2r6KBDNCS/":
                return rendered
            return ""

        with patch("server_modules.audioflix_instagram_public._graphql", return_value=None):
            with patch("server_modules.audioflix_instagram_public._request", return_value=b"<html><title>Instagram</title></html>"):
                with patch("server_modules.audioflix_instagram_browser.render_instagram_html", side_effect=render):
                    metadata = audioflix_instagram_metadata.resolve_metadata("DS2r6KBDNCS")

        self.assertTrue(metadata["ok"])
        self.assertEqual(metadata["creator"], "xarzzu")
        self.assertEqual(metadata["creatorDisplayName"], "Xarzzu")
        self.assertEqual(metadata["title"], "Original audio — xarzzu")
        self.assertEqual(metadata["artist"], "xarzzu")
        self.assertEqual(metadata["audioKind"], "original_audio")
        self.assertIn("https://www.instagram.com/p/DS2r6KBDNCS/", calls)


if __name__ == "__main__":
    unittest.main()
