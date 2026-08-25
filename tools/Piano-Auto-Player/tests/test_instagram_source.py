from app.source_discovery import is_supported_media_url

# Importing the service launcher mirrors the production startup path: it
# registers Instagram before app.server imports the transcription stack.
import run  # noqa: F401,E402


def test_instagram_reel_urls_are_supported_media_sources():
    assert is_supported_media_url("https://www.instagram.com/reel/DUMMY123/")
    assert is_supported_media_url("https://instagram.com/p/DUMMY123/")


def test_existing_media_sources_remain_supported():
    assert is_supported_media_url("https://youtu.be/dQw4w9WgXcQ")
    assert is_supported_media_url("https://soundcloud.com/example/track")
