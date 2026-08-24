import unittest

from server_modules import audioflix_instagram_public_proxy as proxy


class InstagramPublicProxyMetadataTests(unittest.TestCase):
    def test_downloader_page_attribution_promotes_original_audio(self):
        page = """
        <html><body>
          <div>A post shared by Xarzzu (@xarzzu)</div>
          <div>Original audio</div>
          <a href="https://cdn.example/video.mp4">Download</a>
        </body></html>
        """
        metadata = proxy._visible_metadata_from_download_page(page)
        self.assertEqual(metadata["creator"], "xarzzu")
        self.assertEqual(metadata["creatorDisplayName"], "Xarzzu")
        self.assertEqual(metadata["audioKind"], "original_audio")
        self.assertEqual(metadata["audioTitle"], "Original audio — xarzzu")
        self.assertEqual(metadata["audioArtist"], "xarzzu")
        self.assertEqual(metadata["title"], "Original audio — xarzzu")
        self.assertEqual(metadata["artist"], "xarzzu")

    def test_apply_download_metadata_replaces_generic_result(self):
        result = {
            "ok": True,
            "videoUrl": "https://cdn.example/video.mp4",
            "title": "Instagram Video",
            "artist": "Instagram",
        }
        page = "<p>A post shared by Xarzzu (@xarzzu)</p><span>Original audio</span>"
        enriched = proxy._apply_download_metadata(result, page)
        self.assertEqual(enriched["title"], "Original audio — xarzzu")
        self.assertEqual(enriched["artist"], "xarzzu")
        self.assertEqual(enriched["creator"], "xarzzu")
        self.assertEqual(enriched["audioKind"], "original_audio")


if __name__ == "__main__":
    unittest.main()
