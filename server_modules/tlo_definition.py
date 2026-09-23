"""TLO's effective file-backed definition; private override wins over tracked seed."""

from __future__ import annotations

import os
import hashlib
import shutil
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = ROOT / "config" / "agents" / "tlo" / "AGENT.md"
ORIGIN_PATH = SEED_PATH.with_name("ORIGIN.md")
LIVE_PATH = ROOT / "data" / "runtime" / "agent-management" / "tlo" / "AGENT.md"
MAX_CHARS = 16000


class DefinitionError(ValueError):
    """An authored TLO definition is invalid or unreadable."""


def validate(text: object) -> str:
    if not isinstance(text, str):
        raise DefinitionError("TLO definition must be text")
    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized or len(normalized) > MAX_CHARS or "\x00" in normalized:
        raise DefinitionError(f"TLO definition must contain 1–{MAX_CHARS} characters and no null bytes")
    return normalized + "\n"


def revision(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _legacy_text(agent: dict | None) -> str | None:
    """Preserve authored v1 JSON identity until the user saves a file override."""
    if not agent:
        return None
    from server_modules.agent_management_store import default_store

    default = default_store()["agents"][0]
    if agent.get("identity") == default["identity"] and agent.get("workingRules") == default["workingRules"]:
        return None
    sections = [f"# {agent.get('displayName') or 'TLO'}", str(agent.get("identity") or "").strip()]
    rules = [str(rule).strip() for rule in agent.get("workingRules") or [] if str(rule).strip()]
    if rules:
        sections.append("## Working rules\n" + "\n".join(f"- {rule}" for rule in rules))
    return validate("\n\n".join(section for section in sections if section))


def load(agent: dict | None = None) -> dict:
    if LIVE_PATH.exists():
        path, source = LIVE_PATH, "private-file"
    else:
        legacy = _legacy_text(agent)
        if legacy is not None:
            return {"text": legacy, "source": "legacy-profile", "revision": revision(legacy),
                    "path": str(ROOT / "data" / "runtime" / "agent-management" / "agents.json"),
                    "origin": ORIGIN_PATH.read_text(encoding="utf-8")}
        path, source = SEED_PATH, "starter-file"
    try:
        text = validate(path.read_text(encoding="utf-8"))
        return {"text": text, "source": source, "revision": revision(text),
                "path": str(path), "origin": ORIGIN_PATH.read_text(encoding="utf-8")}
    except (OSError, UnicodeError) as exc:
        raise DefinitionError("TLO definition file could not be read safely") from exc


def save(text: object) -> dict:
    normalized = validate(text)
    LIVE_PATH.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix="agent-", suffix=".tmp", dir=LIVE_PATH.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(normalized)
            stream.flush()
            os.fsync(stream.fileno())
        if LIVE_PATH.exists():
            shutil.copy2(LIVE_PATH, LIVE_PATH.with_name("AGENT.backup.md"))
        os.replace(temporary, LIVE_PATH)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return {"text": normalized, "source": "private-file", "revision": revision(normalized), "path": str(LIVE_PATH),
            "origin": ORIGIN_PATH.read_text(encoding="utf-8")}
