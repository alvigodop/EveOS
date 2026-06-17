"""Domain-aware cleanup for Gemini response transcriptions.

The local Vosk pass hears Gemini's spoken audio, so product names and EveOS
terms can be misread as ordinary English ("EveOS context" -> "evil as context").
Keep corrections contextual: never rewrite a standalone word just because it
sounds similar.
"""

from __future__ import annotations

import os
import re


BASE_HINT_PHRASES = [
    "EveOS",
    "Eve OS",
    "Gemini",
    "Gemini Live",
    "Gemini Link",
    "Nexus",
    "Unidex",
    "data pack",
    "datapack",
    "context relay",
    "EveOS context",
    "EveOS context relay",
    "smart folders",
    "system views",
    "bookmark",
    "bookmarks",
]


def _extra_terms() -> list[str]:
    raw = os.environ.get("EVEOS_TRANSCRIPTION_TERMS", "")
    terms = re.split(r"[,;\n]+", raw)
    return [term.strip() for term in terms if term.strip()]


def get_hint_phrases() -> list[str]:
    seen = set()
    phrases = []
    for phrase in [*BASE_HINT_PHRASES, *_extra_terms()]:
        key = phrase.casefold()
        if key in seen:
            continue
        seen.add(key)
        phrases.append(phrase)
    return phrases


def get_vosk_phrase_list() -> list[str]:
    # [unk] prevents phrase hints from becoming a closed vocabulary.
    return [*get_hint_phrases(), "[unk]"]


def hint_grammar_enabled() -> bool:
    return os.environ.get("EVEOS_TRANSCRIPTION_USE_HINT_GRAMMAR", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def normalize_transcript(text: str) -> str:
    if not text:
        return ""

    cleaned = " ".join(str(text).split())
    if not cleaned:
        return ""

    replacements = [
        (r"\beve\s+os\b", "EveOS"),
        (r"\beve\s+oh\s+ess\b", "EveOS"),
        (r"\beve\s+o\s+s\b", "EveOS"),
        (r"\be\s+v\s+o\s+s\b", "EveOS"),
        (r"\bgemini\s+life\b", "Gemini Live"),
        (r"\bgemini\s+live\s+link\b", "Gemini Live Link"),
        (r"\bgemini\s+link\b", "Gemini Link"),
        (r"\bdata\s+pack\b", "data pack"),
    ]
    for pattern, value in replacements:
        cleaned = re.sub(pattern, value, cleaned, flags=re.IGNORECASE)

    eveos_context_patterns = [
        (r"\bfrom\s+the\s+evil\s+as\s+context\b", "from the EveOS context"),
        (r"\bthe\s+evil\s+as\s+context\b", "the EveOS context"),
        (r"\bevil\s+as\s+context\b", "EveOS context"),
        (r"\bevil\s+(context|relay|snapshot|datapack|data pack|workspace|site|system|app)\b", r"EveOS \1"),
    ]
    for pattern, value in eveos_context_patterns:
        cleaned = re.sub(pattern, value, cleaned, flags=re.IGNORECASE)

    proper_names = {
        "eveos": "EveOS",
        "gemini": "Gemini",
        "nexus": "Nexus",
        "unidex": "Unidex",
    }

    def restore_name(match: re.Match) -> str:
        return proper_names.get(match.group(0).casefold(), match.group(0))

    cleaned = re.sub(r"\b(eveos|gemini|nexus|unidex)\b", restore_name, cleaned, flags=re.IGNORECASE)
    return cleaned.strip()
