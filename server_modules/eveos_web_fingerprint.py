"""Fast, exact source fingerprint for the EveOS web component.

The Local Control update planner intentionally captures the full source tree at import time.
The localhost web server must not pay for that full capture just to publish its identity, so
this module reproduces only the update planner's current ``web`` component scope.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
from itertools import islice
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


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
    if _is_ignored(relative):
        return False
    return (relative == "EveOS.html" or path.suffix.lower() in _SOURCE_SUFFIXES) and path.is_file()


def _is_web_source(relative: str) -> bool:
    """Match the update planner's current ``web`` component classification exactly."""
    normalized = relative.replace("\\", "/")
    if normalized in _CONTROL_ONLY_MODULES:
        return False
    return normalized == "server/python-server.py" or normalized.startswith("server_modules/")


def _git_web_paths(root: Path) -> list[Path] | None:
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
        if _is_web_source(relative):
            paths.append(root / relative)
    return paths


def _iter_web_paths(root: Path):
    checkout = _git_web_paths(root)
    if checkout is not None:
        yield from checkout
        return

    # Match the update planner's source-archive fallback for the web subset.
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

    def ignored(path: Path, directory: bool = False) -> bool:
        relative = path.relative_to(root).as_posix()
        if any(relative == entry or relative.startswith(entry + "/") for entry in restored):
            return False
        if directory and any(entry.startswith(relative + "/") for entry in restored):
            return False
        return any(relative == entry or relative.startswith(entry + "/") for entry in excluded)

    server_entry = root / "server" / "python-server.py"
    if not ignored(server_entry) and server_entry.is_file():
        yield server_entry

    base = root / "server_modules"
    if not base.is_dir():
        return
    for directory, dirnames, filenames in os.walk(base):
        dirnames[:] = sorted(
            name for name in dirnames
            if name not in _IGNORED_PARTS and not name.endswith("-venv")
            and name != ".browser-ai-bridge" and not name.startswith(".camofox-staging-")
            and not ignored(Path(directory) / name, directory=True)
        )
        for filename in sorted(filenames):
            candidate = Path(directory) / filename
            if not ignored(candidate):
                yield candidate


def _file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _web_source_record(root: Path, path: Path):
    try:
        relative = path.relative_to(root).as_posix()
    except ValueError:
        return None
    if not _is_source(path, relative) or not _is_web_source(relative):
        return None
    return relative, _file_digest(path)


def capture_web_fingerprint() -> str:
    """Return the same digest that ``eveos_update_plan`` computes for ``web`` only."""
    root = _root()
    aggregate = hashlib.sha256()
    candidates = iter(_iter_web_paths(root))
    with ThreadPoolExecutor(max_workers=4, thread_name_prefix="eveos-web-hash") as pool:
        while batch := list(islice(candidates, 64)):
            for record in pool.map(lambda path: _web_source_record(root, path), batch):
                if record is None:
                    continue
                relative, digest = record
                aggregate.update(relative.encode("utf-8"))
                aggregate.update(b"\0")
                aggregate.update(digest.encode("ascii"))
                aggregate.update(b"\0")
    return aggregate.hexdigest()
