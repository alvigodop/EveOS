"""Supported Gemini model registry and persisted-id migration helpers.

Keep model policy in one place. Preview aliases are short-lived, so every caller
must resolve user-controlled or persisted values through this module before an
API request is made.
"""

from __future__ import annotations

from copy import deepcopy


LIVE_DEFAULT_MODEL = "gemini-3.1-flash-live-preview"
TEXT_BRAIN_DEFAULT_MODEL = "gemini-3.5-flash-lite"
TRANSCRIPTION_DEFAULT_MODEL = "gemini-3.6-flash"


LIVE_MODELS = {
    LIVE_DEFAULT_MODEL: {
        "label": "Gemini 3.1 Flash Live Preview",
        "capabilities": {
            "audio_output": True,
            "input_audio_transcription": True,
            "output_audio_transcription": True,
            "affective_dialog": False,
            "proactive_audio": False,
        },
    },
    "gemini-2.5-flash-native-audio-preview-12-2025": {
        "label": "Gemini 2.5 Flash Native Audio (12-2025 fallback)",
        "capabilities": {
            "audio_output": True,
            "input_audio_transcription": True,
            "output_audio_transcription": True,
            "affective_dialog": True,
            "proactive_audio": True,
        },
    },
}


TEXT_BRAIN_MODELS = {
    "gemini-3.5-flash-lite": {
        "label": "Gemini 3.5 Flash-Lite (recommended)",
        "capabilities": {"text_generation": True, "large_context": True},
    },
    "gemini-3.5-flash": {
        "label": "Gemini 3.5 Flash",
        "capabilities": {"text_generation": True, "large_context": True},
    },
    "gemini-3.6-flash": {
        "label": "Gemini 3.6 Flash",
        "capabilities": {"text_generation": True, "large_context": True},
    },
    "gemini-3.1-flash-lite": {
        "label": "Gemini 3.1 Flash-Lite (compatibility fallback)",
        "capabilities": {"text_generation": True, "large_context": True},
    },
}


TRANSCRIPTION_MODELS = {
    TRANSCRIPTION_DEFAULT_MODEL: {
        "label": "Gemini 3.6 Flash",
        "capabilities": {"audio_input": True, "text_generation": True},
    },
    "gemini-3.5-flash": {
        "label": "Gemini 3.5 Flash",
        "capabilities": {"audio_input": True, "text_generation": True},
    },
}


LEGACY_MODEL_MIGRATIONS = {
    "live": {
        "gemini-2.5-flash-native-audio-latest": LIVE_DEFAULT_MODEL,
        "gemini-2.5-flash-preview-native-audio-dialog": LIVE_DEFAULT_MODEL,
        "gemini-2.5-flash-experimental-native-audio-thinking-dialog": LIVE_DEFAULT_MODEL,
        "gemini-2.0-flash-live-001": LIVE_DEFAULT_MODEL,
        "gemini-live-2.5-flash-preview": LIVE_DEFAULT_MODEL,
    },
    "text_brain": {
        "gemini-2.5-flash-lite": TEXT_BRAIN_DEFAULT_MODEL,
        "gemini-2.5-flash": "gemini-3.5-flash",
        "gemini-2.5-pro": "gemini-3.6-flash",
        "gemini-2.0-flash-lite": TEXT_BRAIN_DEFAULT_MODEL,
        "gemini-2.0-flash": "gemini-3.5-flash",
    },
    "transcription": {
        "gemini-2.0-flash": TRANSCRIPTION_DEFAULT_MODEL,
        "gemini-2.5-flash": TRANSCRIPTION_DEFAULT_MODEL,
    },
}


_REGISTRIES = {
    "live": LIVE_MODELS,
    "text_brain": TEXT_BRAIN_MODELS,
    "transcription": TRANSCRIPTION_MODELS,
}

_DEFAULTS = {
    "live": LIVE_DEFAULT_MODEL,
    "text_brain": TEXT_BRAIN_DEFAULT_MODEL,
    "transcription": TRANSCRIPTION_DEFAULT_MODEL,
}


def resolve_model(kind: str, name: object) -> str:
    """Return a supported model id, migrating known aliases and rejecting unknown ids."""
    if kind not in _REGISTRIES:
        raise ValueError(f"Unknown Gemini model kind: {kind}")
    candidate = str(name or "").strip()
    candidate = LEGACY_MODEL_MIGRATIONS.get(kind, {}).get(candidate, candidate)
    return candidate if candidate in _REGISTRIES[kind] else _DEFAULTS[kind]


def resolve_live_model(name: object) -> str:
    return resolve_model("live", name)


def resolve_text_brain_model(name: object) -> str:
    return resolve_model("text_brain", name)


def resolve_transcription_model(name: object) -> str:
    return resolve_model("transcription", name)


def model_capabilities(kind: str, name: object) -> dict:
    resolved = resolve_model(kind, name)
    return deepcopy(_REGISTRIES[kind][resolved]["capabilities"])


def model_options(kind: str) -> tuple[str, ...]:
    if kind not in _REGISTRIES:
        raise ValueError(f"Unknown Gemini model kind: {kind}")
    return tuple(_REGISTRIES[kind].keys())


def public_registry() -> dict:
    """Serializable registry shape used by diagnostics and parity smokes."""
    return {
        "defaults": dict(_DEFAULTS),
        "models": deepcopy(_REGISTRIES),
        "migrations": deepcopy(LEGACY_MODEL_MIGRATIONS),
    }
