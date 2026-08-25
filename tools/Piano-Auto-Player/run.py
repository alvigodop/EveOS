import argparse

from app import source_discovery

# Instagram Reels/video posts are a first-class media source for the existing
# yt-dlp -> WAV -> Basic Pitch / Hi-Fi transcription pipeline. Keep the
# registration here so older provider logic remains unchanged and the server
# imports the expanded allowlist before constructing its transcriber.
source_discovery.SUPPORTED_MEDIA_HOSTS.update({
    "instagram.com": "Instagram",
    "www.instagram.com": "Instagram",
})

from app.server import run

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Piano Auto Player local service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8771)
    parser.add_argument("--no-browser", action="store_true", help="Compatibility flag for EveOS")
    args = parser.parse_args()
    run(host=args.host, port=args.port)
