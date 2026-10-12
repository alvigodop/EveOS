"""Explicit source fingerprinting and selective reload planning for EveOS.

Fingerprints are captured once when Local Control imports this module. They are recomputed only
when a user explicitly checks for updates (or after a successful component replacement). This is
intentionally not a Git-SHA monitor: uncommitted source changes must be visible too.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from itertools import islice
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

_SCAN_ROOTS = ("js", "css", "server", "server_modules", "config", "tools")
_ROOT_SOURCES = ("EveOS.html", "package.json", "package-lock.json", "start-server.bat")
_IGNORED_TOP_LEVEL = {".git", ".github", "data", "docs", "node_modules", "tests"}
_IGNORED_PARTS = {
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".venv", "venv",
    "node_modules", "dist", "build", ".cache", ".git",
}
_SOURCE_SUFFIXES = {".py", ".js", ".mjs", ".cjs", ".css", ".html", ".json", ".ps1", ".bat", ".cmd"}
_CONTROL_ONLY_MODULES = {
    "server/eveos-control-helper.py",
    "server_modules/eveos_control_helper.py",
    "server_modules/eveos_control_probe.py",
    "server_modules/eveos_control_replace.py",
    "server_modules/eveos_spotify_reload.py",
    "server_modules/eveos_update_plan.py",
}
_WEB_ONLY_MODULES = {"server_modules/eveos_server_status.py"}
_LOCK = threading.RLock()


def _root() -> Path:
    return Path(__file__).resolve().parent.parent


def _baseline_path() -> Path:
    return _root() / "data" / "runtime" / "eveos-update-baseline.json"


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
    if _is_ignored(relative):
        return False
    return (relative == "EveOS.html" or path.suffix.lower() in _SOURCE_SUFFIXES) and path.is_file()


def _classify(relative: str) -> tuple[str, ...]:
    p = relative.replace("\\", "/")
    lower = p.lower()
    components: set[str] = set()

    if p in _CONTROL_ONLY_MODULES:
        return ("localControl",)
    if p in _WEB_ONLY_MODULES:
        return ("web",)

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
    if not components:
        components.add("review")
    return tuple(sorted(components))


def _file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _git_source_paths(root: Path) -> list[Path] | None:
    """Respect checkout ignore rules without hashing downloaded runtimes or user state.

    Tracked files remain visible even when an ignore pattern matches them. New untracked
    source is included; a source archive without Git retains the filesystem fallback.
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=3.0,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    paths = []
    for relative in sorted(set(result.stdout.decode("utf-8").split("\0"))):
        parts = Path(relative).parts
        if not parts or Path(relative).is_absolute() or ".." in parts:
            continue
        if relative in _ROOT_SOURCES or parts[0] in _SCAN_ROOTS:
            paths.append(root / relative)
    return paths


def _iter_source_paths(root: Path):
    checkout = _git_source_paths(root)
    if checkout is not None:
        yield from checkout
        return
    # Without Git metadata, conservatively honor literal root ignore paths. This
    # is not a replacement for Git's full wildmatch/nested-ignore semantics.
    try:
        rules = (root / ".gitignore").read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        rules = []
    excluded, restored = set(), set()
    for rule in rules:
        rule = rule.strip()
        if not rule or rule.startswith("#") or any(char in rule for char in "*?["):
            continue
        destination = restored if rule.startswith("!") else excluded
        relative = rule.lstrip("!").strip("/")
        if relative:
            destination.add(relative)
    def ignored(path, directory=False):
        relative = path.relative_to(root).as_posix()
        if any(relative == entry or relative.startswith(entry + "/") for entry in restored):
            return False
        # Traverse to explicit re-inclusions without unignoring their siblings.
        if directory and any(entry.startswith(relative + "/") for entry in restored):
            return False
        return any(relative == entry or relative.startswith(entry + "/") for entry in excluded)

    for filename in _ROOT_SOURCES:
        candidate = root / filename
        if not ignored(candidate) and candidate.is_file():
            yield candidate
    for root_name in _SCAN_ROOTS:
        base = root / root_name
        if not base.is_dir():
            continue
        for directory, dirnames, filenames in os.walk(base):
            dirnames[:] = sorted(name for name in dirnames
                                 if name not in _IGNORED_PARTS and not name.endswith("-venv")
                                 and name != ".browser-ai-bridge" and not name.startswith(".camofox-staging-")
                                 and not ignored(Path(directory) / name, directory=True))
            for filename in sorted(filenames):
                candidate = Path(directory) / filename
                if not ignored(candidate):
                    yield candidate


def _source_record(root: Path, path: Path):
    try:
        relative = path.relative_to(root).as_posix()
    except ValueError:
        return None
    if not _is_source(path, relative):
        return None
    return relative, _classify(relative), _file_digest(path)


def _capture() -> dict:
    root = _root()
    files: dict[str, dict] = {}
    component_hashes = {key: hashlib.sha256() for key in _COMPONENT_ACTIONS}
    candidates = iter(_iter_source_paths(root))
    # Bound disk readers and queued work; ordered map preserves every existing
    # component digest. Never cache, omit sources, or defer the startup baseline.
    with ThreadPoolExecutor(max_workers=4, thread_name_prefix="eveos-source-hash") as pool:
        while batch := list(islice(candidates, 64)):
            for record in pool.map(lambda path: _source_record(root, path), batch):
                if record is None:
                    continue
                relative, components, digest = record
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


def _valid_baseline(value) -> bool:
    return isinstance(value, dict) and isinstance(value.get("files"), dict) \
        and isinstance(value.get("components"), dict) \
        and all(key in value["components"] for key in _COMPONENT_ACTIONS)


def _persist_baseline() -> None:
    if not _BASELINE_OWNER:
        return
    path = _baseline_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(_BASELINE, indent=2), encoding="utf-8")
    temporary.replace(path)


def _load_preserved_baseline() -> dict | None:
    if not _BASELINE_OWNER:
        return None
    try:
        value = json.loads(_baseline_path().read_text(encoding="utf-8"))
        return value if _valid_baseline(value) else None
    except (OSError, ValueError, TypeError):
        return None


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
    changed_set = set(changed_components)
    changed = [item for item in _changed_files(_BASELINE, current)
               if changed_set.intersection(item.get("components") or ())]
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
    with _LOCK:
        return _build_plan(_capture())


def baseline_status() -> dict:
    with _LOCK:
        return {
            "ok": True,
            "capturedAt": _STARTUP_CAPTURE["capturedAt"],
            "componentFingerprints": dict(_STARTUP_CAPTURE["components"]),
            "baselineAt": _BASELINE["capturedAt"],
            "baselineFingerprints": dict(_BASELINE["components"]),
        }


def startup_status() -> dict:
    return baseline_status()


def mark_applied(components) -> dict:
    wanted = {str(value) for value in (components or []) if str(value) in _COMPONENT_ACTIONS}
    with _LOCK:
        current = _capture()
        for component in wanted:
            _BASELINE["components"][component] = current["components"][component]
        _BASELINE["capturedAt"] = current["capturedAt"]
        _persist_baseline()
        return _build_plan(current)


_STARTUP_CAPTURE = _capture()
_ARGV0 = Path(sys.argv[0]).name.lower() if sys.argv else ""
_BASELINE_OWNER = "--probe" not in sys.argv and (
    os.environ.get("EVEOS_UPDATE_BASELINE_OWNER") == "1"
    or "eveos-control-helper" in _ARGV0
    or "--scoped-restart" in sys.argv
)
_SCOPED_CONTROL_REPLACEMENT = _BASELINE_OWNER and (
    os.environ.get("EVEOS_CONTROL_SCOPED_RESTART") == "1" or "--scoped-restart" in sys.argv
)
_BASELINE = (_load_preserved_baseline() if _SCOPED_CONTROL_REPLACEMENT else None) or {
    "capturedAt": _STARTUP_CAPTURE["capturedAt"],
    "files": dict(_STARTUP_CAPTURE["files"]),
    "components": dict(_STARTUP_CAPTURE["components"]),
}
if _BASELINE_OWNER and not _SCOPED_CONTROL_REPLACEMENT:
    _persist_baseline()
