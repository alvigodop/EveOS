"""Spotify link -> the YouTube video holding the SAME recording.

Spotify audio is Widevine-encrypted and cannot be downloaded, so localizing a Spotify track means
matching it to YouTube and localizing that. The matching is the part that can silently do the wrong
thing: pick a live take, a remix, a sped-up edit, or a full-album upload, and quietly write it into
the library under the right song's name.

Fixtures come from a real observed search so the expectations are not invented. Spotify reports
"Never Gonna Give You Up" at 213573ms; YouTube returns the official video (213s, 1.8B views), a 2022
remaster (214s, 11M), an instrumental (217s), a live performance (234s) and an hour-long loop.

The regression this pins hardest: ranking by duration precision BEFORE popularity picked the remaster
over the official video, because YouTube reports whole seconds and Spotify milliseconds, so 0.15s of
rounding noise outranked a 156x view difference. Deltas inside the noise floor must count as equal.

Audio bitrate has exactly the same trap and is pinned the same way, using three real uploads of
Lauren Aquilina's "King" whose bitrates span 137.5-140.9 kbps: noise must not reorder, but a
genuinely low-bitrate upload must lose even when it is the most played.

Runs offline — the network paths are injected.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "server_modules"))
import audioflix_spotify_match as M  # noqa: E402


def check(condition, message):
    if not condition:
        raise AssertionError("ASSERT FAILED: " + message)


SPOTIFY = {"title": "Never Gonna Give You Up", "artists": ["Rick Astley"],
           "duration_ms": 213573, "duration_seconds": 213.573, "ok": True}

CANDIDATES = [
    {"id": "dQw4w9WgXcQ", "title": "Rick Astley - Never Gonna Give You Up (Official Video) (4K)",
     "duration": 213, "view_count": 1798041570, "webpage_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
    {"id": "rmst", "title": "Never Gonna Give You Up (2022 Remaster)",
     "duration": 214, "view_count": 11480611, "webpage_url": "https://y/rmst"},
    {"id": "inst", "title": "Rick Astley - Never Gonna Give You Up (Instrumental)",
     "duration": 217, "view_count": 900000, "webpage_url": "https://y/inst"},
    {"id": "live", "title": "Never Gonna Give You Up | Rick Astley Rocks New Year's Eve",
     "duration": 234, "view_count": 5212546, "webpage_url": "https://y/live"},
    {"id": "loop", "title": "Never Gonna Give You Up - 1 HOUR loop",
     "duration": 213, "view_count": 90000000, "webpage_url": "https://y/loop"},
    {"id": "nodur", "title": "Never Gonna Give You Up", "duration": None,
     "view_count": 5000, "webpage_url": "https://y/nodur"},
]


def main():
    # ---- link parsing ----
    check(M.spotify_track_id("https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8") == "4PTG3Z6ehGkBFwjybzWkR8",
          "track id parsed from a web link")
    check(M.spotify_track_id("spotify:track:4PTG3Z6ehGkBFwjybzWkR8") == "4PTG3Z6ehGkBFwjybzWkR8",
          "track id parsed from a uri")
    check(M.spotify_track_id("https://open.spotify.com/album/4PTG3Z6ehGkBFwjybzWkR8x") == "",
          "an album link is not treated as a track")
    check(M.spotify_track_id("https://youtube.com/watch?v=x") == "", "a non-spotify link yields nothing")

    # ---- metadata parsing, from the shape the real embed page returns ----
    html = ('<script type="application/json">'
            '{"a":{"name":"Never Gonna Give You Up","duration":213573,'
            '"artists":[{"name":"Rick Astley"}],'
            '"audioPreview":{"url":"https://p.scdn.co/mp3-preview/abc"}}}'
            '</script>')
    meta = M.parse_embed_html(html)
    check(meta.get("title") == "Never Gonna Give You Up", f"title parsed (got {meta.get('title')!r})")
    check(meta.get("duration_ms") == 213573, f"exact duration in ms parsed (got {meta.get('duration_ms')})")
    check(meta.get("artists") == ["Rick Astley"], f"artist parsed (got {meta.get('artists')})")
    check(meta.get("preview_url", "").startswith("https://p.scdn.co/"), "the DRM-free preview url is captured")
    check(M.parse_embed_html("<html>no json</html>") == {}, "a page with no payload yields nothing, not a crash")

    # ---- the query sent to YouTube ----
    check(M.search_query(SPOTIFY) == "Rick Astley Never Gonna Give You Up",
          f"query is artist + title (got {M.search_query(SPOTIFY)!r})")

    # ---- ranking ----
    accepted, rejected = M.rank_candidates(SPOTIFY, CANDIDATES)
    by_id = {entry["id"]: entry for entry in rejected}

    check("live" in by_id, "a live performance is rejected")
    check("234s" in by_id["live"]["reason"], f"rejected on duration (got {by_id['live']['reason']})")
    check("inst" in by_id, "an instrumental is rejected as a different edition")
    check("loop" in by_id, "an hour-long loop is rejected even though its duration field matches")
    check("nodur" in by_id, "a candidate with no duration is rejected rather than assumed")

    check(accepted, "at least one candidate survives")
    # THE regression: most-played among the plausible, not the one that happens to round closer.
    check(accepted[0]["id"] == "dQw4w9WgXcQ",
          f"the official video wins on views among duration-equal takes (got {accepted[0]['id']!r})")
    check(accepted[1]["id"] == "rmst", "the remaster is the runner-up, not the winner")
    check(accepted[0]["delta"] > accepted[1]["delta"],
          "the winner is chosen DESPITE a slightly larger rounding delta, which is the whole point")

    # A tighter gate narrows the field and never admits a different recording. Note the remaster's
    # delta (0.427s) is SMALLER than the official video's (0.573s) purely from second-rounding, which
    # is exactly why duration precision must not be the ranking key.
    tight, _ = M.rank_candidates(SPOTIFY, CANDIDATES, tolerance_seconds=0.5)
    tight_ids = [entry["id"] for entry in tight]
    check(len(tight_ids) < len(accepted), f"a tighter gate narrows the field (got {tight_ids})")
    check(not {"live", "inst", "loop", "nodur"} & set(tight_ids),
          f"tightening never admits a different recording (got {tight_ids})")

    # If the user actually asked for a live version, a live upload must become eligible.
    live_wanted = dict(SPOTIFY, title="Never Gonna Give You Up - Live", duration_seconds=234.0)
    live_ok, _ = M.rank_candidates(live_wanted, CANDIDATES)
    check(any(e["id"] == "live" for e in live_ok),
          "a live edition is allowed when the Spotify title says live")

    # ---- audio quality as a tie-break ----
    # Read from audio-only formats. The muxed entry carries an absurd bitrate so a broken filter
    # shows up as a wrong number rather than as a ranking that happens to still pass.
    def formats(abr):
        return [{"vcodec": "avc1.4d401f", "acodec": "mp4a.40.2", "abr": abr + 500},
                {"vcodec": "none", "acodec": "mp4a.40.5", "abr": 48.8},
                {"vcodec": "none", "acodec": "opus", "abr": abr}]

    check(M.best_audio_abr({"formats": formats(140.252)}) == 140.252,
          f"the top audio-only bitrate is read, not the muxed one (got {M.best_audio_abr({'formats': formats(140.252)})})")
    check(M.best_audio_abr({"formats": [], "abr": 130.0}) == 130.0, "an item-level abr is the fallback")
    check(M.best_audio_abr({}) == 0.0, "no format data yields 0, not a crash")
    check(M.quality_tier(0) == 0, "an unknown bitrate is treated as normal, never demoted on a data gap")

    # The real observed case: three uploads of Lauren Aquilina's "King", all 238s. Their bitrates
    # span 137.5-140.9 kbps, which is encoder noise — and note the HIGHEST belongs to the LEAST
    # played upload, so sorting on the number itself would flip the pick to a 5M-view video over a
    # 204M-view one on a 0.6 kbps difference. Tiers must render them equal and let plays decide.
    king = {"title": "King", "artists": ["Lauren Aquilina"], "duration_seconds": 238.0}
    king_candidates = [
        {"id": "lyrics", "title": "Lauren Aquilina - King (Lyrics)", "duration": 238,
         "view_count": 12823994, "formats": formats(137.484), "webpage_url": "https://y/lyrics"},
        {"id": "plain", "title": "King", "duration": 238,
         "view_count": 4977233, "formats": formats(140.913), "webpage_url": "https://y/plain"},
        {"id": "viral", "title": "you can be king again", "duration": 238,
         "view_count": 204204170, "formats": formats(140.252), "webpage_url": "https://y/viral"},
    ]
    king_ranked, _ = M.rank_candidates(king, king_candidates)
    check([e["id"] for e in king_ranked] == ["viral", "lyrics", "plain"],
          f"equal-quality uploads rank on plays (got {[e['id'] for e in king_ranked]})")
    check(len({e["quality"] for e in king_ranked}) == 1,
          "137-141 kbps is one tier, so the spread never reorders anything")

    # But a genuinely worse upload IS demoted, even when it is the most played of the three — this
    # is the whole reason quality sits above popularity rather than beside it.
    poor = dict(king_candidates[2], id="poor", formats=formats(64.0), view_count=900000000)
    poor_ranked, _ = M.rank_candidates(king, king_candidates[:2] + [poor])
    check(poor_ranked[-1]["id"] == "poor",
          f"a low-bitrate upload loses despite the most plays (got {[e['id'] for e in poor_ranked]})")
    check(poor_ranked[0]["id"] == "lyrics",
          "with the viral upload degraded, the most-played NORMAL-quality one wins")

    # ---- end to end, with both network calls injected ----
    result = M.find_youtube_match(
        "https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8",
        opener=lambda request: html,
        searcher=lambda query, results: CANDIDATES,
    )
    check(result.get("ok") is True, f"the full path resolves (got {result.get('message')!r})")
    check(result.get("url") == "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          f"the resolved url is the official video (got {result.get('url')!r})")
    check((result.get("spotify") or {}).get("title") == "Never Gonna Give You Up",
          "spotify metadata is carried through so the saved filename can use it")

    # Nothing plausible must fail loudly rather than localize the wrong song.
    none_ok = M.find_youtube_match(
        "https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8",
        opener=lambda request: html,
        searcher=lambda query, results: [CANDIDATES[3]],   # live take only
    )
    check(none_ok.get("ok") is False, "no plausible candidate is a failure, not a fallback")
    check("No YouTube result matched" in (none_ok.get("message") or ""),
          f"the failure explains itself (got {none_ok.get('message')!r})")
    check(none_ok.get("rejected"), "the rejections are reported so a near-miss is diagnosable")

    # A search blowing up must not raise out of the matcher.
    def boom(query, results):
        raise RuntimeError("network down")

    broke = M.find_youtube_match("https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8",
                                 opener=lambda request: html, searcher=boom)
    check(broke.get("ok") is False and "network down" in (broke.get("message") or ""),
          "a search failure is reported, not raised")

    print("spotify match OK - best-matching video chosen; live/instrumental/loop/no-duration "
          "rejected; bitrate noise does not reorder, a low-bitrate upload is demoted")
    print("AUDIOFLIX_SPOTIFY_MATCH_SMOKE_OK")


if __name__ == "__main__":
    main()
