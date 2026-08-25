from app.instagram_source import is_instagram_url


def test_instagram_post_url_uses_piano_fallback_source():
    assert is_instagram_url("https://www.instagram.com/p/DS2r6KBDNCS/")
    assert is_instagram_url("https://www.instagram.com/reel/DZV3t8qh-ya/")


def test_non_instagram_urls_do_not_use_instagram_fallback():
    assert not is_instagram_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
