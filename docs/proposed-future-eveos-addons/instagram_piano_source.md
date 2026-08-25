# EveOS — Instagram URL → Piano Transcription Source

**Status:** Implemented on `Eve-Branch`  
**Date:** 2026-08-24

## What changed

Piano Auto Player now accepts Instagram Reel and video-post URLs through the existing media transcription endpoint. The launcher registers `instagram.com` and `www.instagram.com` as supported public-media hosts before loading the server's transcription stack.

The conversion path remains the existing pipeline:

`Instagram URL → yt-dlp media extraction → canonical WAV → Basic Pitch / Auto Hi-Fi → timed piano performance → sheet`

No Instagram-specific transcription engine or second piano pipeline was added.

## Scope

Supported URL shapes include individual Reel URLs and video-bearing Post URLs. Image-only posts cannot produce piano sheets because there is no audio source.

Rich Instagram attribution metadata remains independent of this feature and is not required for transcription. The existing playback/metadata limitation documented in `instagram_metadata_resolution_deferred.md` is intentionally unchanged.

## Dependency note

The existing Piano media environment already uses yt-dlp. Current yt-dlp releases expose an Instagram extractor capable of resolving Reel media, although Instagram availability can vary with login state and site-side changes. A failed Instagram extraction should surface as a normal media-source error rather than silently substituting another recording.

## Verification

`tests/test_instagram_source.py` covers the production launcher registration and confirms existing YouTube/SoundCloud support remains intact.
