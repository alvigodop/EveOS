"""Explicit source fingerprinting and selective reload planning for EveOS.

Fingerprints are captured once when Local Control imports this module. They are recomputed only
when a user explicitly checks for updates (or after a successful component replacement). This is
intentionally not a Git-SHA monitor: uncommitted source changes must be visible too.
"""
from __future__ import annotations

import hashlib
import threading
from datetime import datetime, timezone
from pathlib import Path


_COMPONENT_ACTIONS = {
    "browser": ("reloadPage", "Reload EveOS page"),
    "web": ("restartService", "Restart EveOS web"),
    "spotifyEngine": ("restartSpotify", "Restart managed Spotify engine"),
    "gemini": ("restartService", "Restart Gemini Link"),
    "worldBook": ("restartService", "Restart World Book"),
    "notes": ("restartService", "Restart Notes"),
    "piano": ("restartService", "Restart Piano Auto Player"),
    "watchFusion": ("restartService", "Restart WatchFusion"),
    "bookmarkIntel": ("restartService", "Restart Bookmark Intel"),
    "localMoe": ("restartService", "Restart Local MoE"),
    "nexusBrowser": ("restartService", "Restart Nexus Browser"),
    "localControl": ("replaceControlPlane", "Replace Local Control"),
    "review": ("reviewRequired", "Review required"),
}

_IGNORED_TOP_LEVEL = {".git", ".github", "data", "docs", "node_modules", "tests"}
_IGNORED_PARTS = {"__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".venv", "venv"}
_SOURCE_SUFFIXES = {".py", ".js", ".mjs", ".cjs", ".css", ".html", ".json", ".ps1", ".bat", ".cmd"}
_LOCK = threading.RLock()


def _root() -> Path:
    return Path(__file__).resolve().parent.parent


def _is_ignored(relative: str) -> bool:
    parts = Path(relative).parts
    if not parts:
        return True
    if parts[0] in _IGNORED_TOP_LEVEL or any(part in _IGNORED_PARTS for part in parts):
        return True
    if relative.startswith(("tools/smoke/", "tools/audit/", "tools/setup/", "tools/qualification/")):
        return True
    return False


def _is_source(path: Path, relative: str) -> bool:
    if _is_ignored(relative) or not path.is_file():
        return False
    if relative == "EveOS.html":
        return True
    return path.suffix.lower() in _SOURCE_SUFFIXES


def _classify(relative: str) -> tuple[str, ...]:
    p = relative.replace("\\", "/")
    lower = p.lower()
    components: set[str] = set()

    # Managed Spotify has its own process boundary even though its engine script is browser JS.
    if p == "tools/audioflix/spotify-engine.html" or lower.startswith("server_modules/audioflix_spotify") \
            or lower.startswith("js/modules/features/audioflix/audioflix.spotify.engine"):
        components.add("spotifyEngine")
        if lower.startswith("server_modules/"):
            components.add("web")
        return tuple(sorted(components))

    if p == "EveOS.html" or p.startswith("js/") or p.endswith(".css"):
        components.add("browser")

    if p == "server/python-server.py":
        components.add("web")
    elif p.startswith("server/gemini-backend/"):
        components.add("gemini")
    elif p.startswith("server_modules/"):
        # Most server_modules are imported by the web runtime. Lifecycle/control modules are
        # additionally imported by Local Control, so shared edits truthfully require both.
        components.add("web")
        name = Path(p).name.lower()
        if name.startswith(("eveos_", "gemini_control", "notes_control", "piano_player_control",
                            "watchfusion_", "world_book_control", "bookmark_intel_control",
                            "local_moe_control", "nexus_browser_control")):
            components.add("localControl")
        if name.startswith("gemini_"):
            components.add("gemini")
        if name.startswith("notes_"):
            components.add("notes")
        if name.startswith("piano_"):
            components.add("piano")
        if name.startswith("watchfusion_"):
            components.add("watchFusion")
        if name.startswith("world_book_"):
            components.add("worldBook")
        if name.startswith("bookmark_intel_"):
            components.add("bookmarkIntel")
        if name.startswith("local_moe_"):
            components.add("localMoe")
        if name.startswith("nexus_browser_"):
            components.add("nexusBrowser")

    if p.startswith("tools/World-Book/"):
        components.add("worldBook")
    elif p.startswith("tools/Bookmark-Intel/"):
        components.add("bookmarkIntel")
    elif "watchfusion" in lower:
        components.add("watchFusion")
    elif "piano" in lower and p.startswith("tools/"):
        components.add("piano")
    elif "notes" in lower and p.startswith("tools/"):
        components.add("notes")
    elif "nexus" in lower and p.startswith("tools/"):
        components.add("nexusBrowser")
    elif "local-moe" in lower and p.startswith("tools/"):
        components.add("localMoe")

    if p.startswith("config/") and not components:
        components.add("review")
    if p.startswith("tools/") and not components:
        components.add("review")
    if not components and p not in {"package.json", "package-lock.json"}:
        components.add("review")
    return tuple(sorted(components))


def _file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _capture() -> dict:
    root = _root()
    files: dict[str, dict] = {}
    component_hashes: dict[str, hashlib._Hash] = {key: hashlib.sha256() for key in _COMPONENT_ACTIONS}
    for path in sorted(root.rglob("*")):
        try:
            relative = path.relative_to(root).as_posix()
        except ValueError:
            continue
        if not _is_source(path, relative):
            continue
        components = _classify(relative)
        if not components:
            continue
        digest = _file_digest(path)
        files[relative] = {"digest": digest, "components": components}
        for component in components:
            bucket = component_hashes[component]
            bucket.update(relative.encode("utf-8")); bucket.update(b"\0")
            bucket.update(digest.encode("ascii")); bucket.update(b"\0")
    return {
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "files": files,
        "components": {key: value.hexdigest() for key, value in component_hashes.items()},
    }


def _changed_files(before: dict, after: dict) -> list[dict]:
    old_files = before.get("files", {})
    new_files = after.get("files", {})
    changed = []
    for relative in sorted(set(old_files) | set(new_files)):
        old = old_files.get(relative)
        new = new_files.get(relative)
        if old == new:
            continue
        components = sorted(set((old or {}).get("components", ())) | set((new or {}).get("components", ())))
        changed.append({
            "path": relative,
            "kind": "added" if old is None else "deleted" if new is None else "modified",
            "components": components,
        })
    return changed


def _build_plan(current: dict) -> dict:
    changed_components = [
        key for key in _COMPONENT_ACTIONS
        if current["components"].get(key) != _BASELINE["components"].get(key)
    ]
    actions = []
    for component in changed_components:
        action, label = _COMPONENT_ACTIONS[component]
        actions.append({"component": component, "action": action, "label": label})
    changed = _changed_files(_BASELINE, current)
    return {
        "ok": True,
        "checkedAt": current["capturedAt"],
        "baselineAt": _BASELINE["capturedAt"],
        "changed": bool(actions),
        "changedFiles": changed,
        "actions": actions,
        "reviewRequired": any(item["component"] == "review" for item in actions),
        "componentFingerprints": current["components"],
        "baselineFingerprints": dict(_BASELINE["components"]),
    }


def check_updates() -> dict:
    """Recompute fingerprints only for an explicit user-requested update check."""
    with _LOCK:
        return _build_plan(_capture())


def baseline_status() -> dict:
    with _LOCK:
        return {
            "ok": True,
            "capturedAt": _BASELINE["capturedAt"],
            "componentFingerprints": dict(_BASELINE["components"]),
        }


def mark_applied(components) -> dict:
    """Advance only components whose replacement/reload has been positively verified."""
    wanted = {str(value) for value in (components or []) if str(value) in _COMPONENT_ACTIONS}
    with _LOCK:
        current = _capture()
        for component in wanted:
            _BASELINE["components"][component] = current["components"][component]
        _BASELINE["capturedAt"] = current["capturedAt"]
        return _build_plan(current)


_BASELINE = _capture()
