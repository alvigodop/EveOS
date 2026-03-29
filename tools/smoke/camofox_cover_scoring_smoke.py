import os
import sys


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from server_modules import camofox


def main():
    title = "Target Example Scene"
    target_url = "https://example.com/scene/target-example-scene/"

    metadata = camofox._build_metadata_from_snapshot(
        target_url,
        '- heading "Target Example Scene"',
        images=[
            {
                "src": "https://example.com/storage/unrelated-scene-320x180.jpg",
                "alt": "Different scene thumbnail",
                "width": 320,
                "height": 180,
            },
            {
                "src": "https://example.com/storage/target-example-scene-320x180.jpg",
                "alt": title,
                "width": 320,
                "height": 180,
            },
        ],
        page_url=target_url,
        dom_metadata={
            "title": title,
            "coverCandidates": [
                {
                    "src": "https://cdn.example.com/posters/target-example-scene-poster.jpg",
                    "source": "video_poster",
                    "width": 1280,
                    "height": 720,
                }
            ],
        },
    )

    if metadata.get("coverUrl") != "https://cdn.example.com/posters/target-example-scene-poster.jpg":
        raise SystemExit("Expected video poster to win cover selection")

    title_overlap_score = camofox._score_image_candidate(
        {
            "src": "https://example.com/storage/target-example-scene-320x180.jpg",
            "alt": title,
            "width": 320,
            "height": 180,
        },
        target_url,
        page_title=title,
    )
    unrelated_score = camofox._score_image_candidate(
        {
            "src": "https://example.com/storage/unrelated-scene-320x180.jpg",
            "alt": "Different scene thumbnail",
            "width": 320,
            "height": 180,
        },
        target_url,
        page_title=title,
    )

    if title_overlap_score <= unrelated_score:
        raise SystemExit("Expected title-matching thumbnail to outrank unrelated thumbnail")

    print("CAMOFOX_COVER_SCORING_SMOKE_OK")


if __name__ == "__main__":
    main()
