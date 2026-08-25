from app.source_discovery import is_supported_media_url


def test_instagram_reel_urls_are_supported_media_sources():
    assert is_supported_media_url("https://www.instagram.com/reel/DUMMY123/")
    assert is_supported_media_url("https://instagram.com/p/DUMMY123/")


def test_existing_media_sources_remain_supported():
    assert is_supported_media_url("https://youtu.be/dQw4w9WgXcQ")
    assert is_supported_media_url("https://soundcloud.com/example/track")
