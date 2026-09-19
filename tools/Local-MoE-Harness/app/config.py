from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _environment_port(name: str, fallback: int) -> int:
    raw = str(os.environ.get(name, "")).strip()
    if not raw:
        return fallback
    try:
        port = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer port, got {raw!r}") from exc
    if not 1 <= port <= 65535:
        raise ValueError(f"{name} must be between 1 and 65535, got {port}")
    return port


def load_settings() -> dict:
    settings_path = ROOT / "config" / "settings.json"
    with open(settings_path, "r", encoding="utf-8") as fp:
        settings = json.load(fp)

    # EveOS owns the effective ports through config/eveos-ports.json and passes
    # them as environment variables. Standalone users retain the checked-in
    # defaults when those variables are absent.
    harness_port = _environment_port("LOCAL_MOE_HARNESS_PORT", int(settings.get("harness_port", 5180)))
    runtime_port = _environment_port("FREETOKEN_PORT", 1919)
    settings["harness_port"] = harness_port
    settings["runtime_base_url"] = os.environ.get(
        "LOCAL_MOE_RUNTIME_BASE_URL", f"http://127.0.0.1:{runtime_port}"
    ).rstrip("/")

    # Context profiles can provide their measured normal MoE residency so the
    # coexistence manager restores the correct cache geometry for 12K vs 8K.
    profile_slots = os.environ.get("LOCAL_MOE_NORMAL_MOE_SLOTS")
    if profile_slots:
        try:
            settings["gpu_coexistence_normal_moe_slots"] = max(1, int(profile_slots))
        except ValueError:
            pass

    # Resolve model_root relative to project root if not absolute
    model_root = Path(settings.get("model_root", "models"))
    if not model_root.is_absolute():
        settings["model_root"] = str((ROOT / model_root).resolve())

    return settings
