import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SERVER_ROOT = ROOT / "server" / "gemini-backend" / "interactions"
sys.path.insert(0, str(SERVER_ROOT))

from main_server_files.transcription.transcription_normalizer import (  # noqa: E402
    get_vosk_phrase_list,
    normalize_transcript,
)


def assert_equal(actual, expected):
    if actual != expected:
        raise AssertionError(f"Expected {expected!r}, got {actual!r}")


def main():
    assert_equal(
        normalize_transcript("yes all of that information came from the evil as context you provided earlier"),
        "yes all of that information came from the EveOS context you provided earlier",
    )
    assert_equal(
        normalize_transcript("the eve os context relay is ready"),
        "the EveOS context relay is ready",
    )
    assert_equal(
        normalize_transcript("this story is about an evil wizard"),
        "this story is about an evil wizard",
    )
    phrases = get_vosk_phrase_list()
    if "EveOS" not in phrases or "[unk]" not in phrases:
        raise AssertionError("Vosk phrase list must include EveOS and [unk]")
    print("GEMINI_TRANSCRIPTION_NORMALIZER_SMOKE_OK")


if __name__ == "__main__":
    main()
