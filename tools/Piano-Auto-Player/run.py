import argparse
from pathlib import Path

from app import source_discovery
from app.audio_transcriber import DownloadedAudio, YouTubePianoTranscriber
from app.instagram_source import is_instagram_url, resolve_and_download

# Instagram Reels/video posts are a first-class media source for the existing
# yt-dlp -> WAV -> Basic Pitch / Hi-Fi transcription pipeline.
source_discovery.SUPPORTED_MEDIA_HOSTS.update({
    "instagram.com": "Instagram",
    "www.instagram.com": "Instagram",
})


_original_download_public_media = YouTubePianoTranscriber._download_public_media


def _download_public_media_with_instagram_fallback(self, job_id, python, url, temp: Path, title_hint=""):
    if is_instagram_url(url):
        self._set(job_id, status="resolving", message="Resolving Instagram media through EveOS…")
        try:
            audio_path, resolved = resolve_and_download(url, temp)
            title = title_hint or str(resolved.get("title") or "Instagram Video").strip() or "Instagram Video"
            return DownloadedAudio(
                source_url=url,
                title=title[:180],
                path=audio_path,
                audio_format="wav",
                method=f"Instagram → {resolved.get('source') or 'EveOS resolver'}",
                duration=float(resolved.get("duration") or 0) or None,
            )
        except Exception as exc:
            # Keep the normal public-media extractor as the final compatibility fallback when
            # the EveOS control plane is offline or the browser/public resolver cannot unlock it.
            self._set(job_id, instagram_fallback_error=str(exc))

    return _original_download_public_media(self, job_id, python, url, temp, title_hint)


YouTubePianoTranscriber._download_public_media = _download_public_media_with_instagram_fallback


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Piano Auto Player local service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8771)
    parser.add_argument("--no-browser", action="store_true", help="Compatibility flag for EveOS")
    args = parser.parse_args()
    from app.server import run
    run(host=args.host, port=args.port)
