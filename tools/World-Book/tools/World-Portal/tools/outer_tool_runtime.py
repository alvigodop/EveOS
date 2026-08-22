"""Runtime-only state and fixed upstream checks for World Portal outer tools."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlencode, urlparse


SYNC_STATE_FORMAT = "world-portal-orogen-sync-state"
SYNC_STATE_VERSION = 2
OROGEN_REPOSITORY = "https://github.com/raguilar011095/planet_heightmap_generation"
OROGEN_UPSTREAM_REF = "refs/heads/main"
_TOKEN_RE = re.compile(r"^[A-Za-z0-9._:-]{8,180}$")


class RuntimeRequestError(RuntimeError):
    def __init__(self, status: int, message: str, state: dict | None = None):
        super().__init__(message)
        self.status = status
        self.state = state or {}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def decode_world_key(value: str | None) -> str:
    return validate_world_key(unquote(str(value or "")))


def validate_world_key(value: str | None) -> str:
    key = str(value or "").strip()
    if not key or len(key) > 180 or any(ord(char) < 32 for char in key):
        raise RuntimeRequestError(400, "A valid world key is required.")
    return key


def require_token(value: str | None, label: str) -> str:
    token = str(value or "").strip()
    if not _TOKEN_RE.fullmatch(token):
        raise RuntimeRequestError(400, f"A valid {label} is required.")
    return token


def require_source_commit(value: str | None) -> str:
    commit = str(value or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise RuntimeRequestError(400, "A full pinned Orogen source commit is required.")
    return commit


def is_outer_tool_referer(referer: str | None, expected_netloc: str | None) -> bool:
    try:
        parsed = urlparse(referer or "")
        return (parsed.scheme in ("http", "https") and parsed.netloc == expected_netloc
                and parsed.path.startswith("/outer/orogen/"))
    except (TypeError, ValueError):
        return False


def orogen_navigation_target(
    request_path: str, referer: str | None, expected_netloc: str | None,
) -> str | None:
    """Map Orogen's root-relative native tabs without hijacking Portal routes."""
    if not is_outer_tool_referer(referer, expected_netloc):
        return None
    path = urlparse(request_path).path.rstrip("/")
    return {"": "/outer/orogen/index.html", "/import": "/outer/orogen/import.html"}.get(path)


class OrogenSyncRuntime:
    """Persist world-keyed sync records without ever editing the vendored tool."""

    def __init__(self, sync_dir: Path):
        self.sync_dir = sync_dir
        self.state_path = sync_dir / "state.json"
        self._lock = threading.RLock()

    def _empty_state(self) -> dict:
        return {
            "format": SYNC_STATE_FORMAT,
            "version": SYNC_STATE_VERSION,
            "updatedAt": utc_now(),
            "worlds": {},
        }

    def _load_state(self) -> dict:
        try:
            state = json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return self._empty_state()
        if state.get("format") != SYNC_STATE_FORMAT or not isinstance(state.get("worlds"), dict):
            return self._empty_state()
        state["version"] = SYNC_STATE_VERSION
        return state

    def _write_state(self, state: dict) -> None:
        self.sync_dir.mkdir(parents=True, exist_ok=True)
        state["updatedAt"] = utc_now()
        with tempfile.NamedTemporaryFile(
            "w", delete=False, dir=self.sync_dir, suffix=".json.tmp", encoding="utf-8"
        ) as handle:
            json.dump(state, handle, indent=2)
            handle.flush()
            temporary = Path(handle.name)
        temporary.replace(self.state_path)

    def status(self, world_key: str | None = None) -> dict:
        with self._lock:
            state = self._load_state()
            worlds = state["worlds"]
            record = worlds.get(world_key) if world_key else None
            valid = bool(record and (self.sync_dir / str(record.get("file", ""))).is_file())
            payload = {
                "syncing": valid if world_key else any(
                    (self.sync_dir / str(item.get("file", ""))).is_file()
                    for item in worlds.values() if isinstance(item, dict)
                ),
                "worldKey": world_key,
            }
            if valid:
                payload.update({
                    key: record.get(key)
                    for key in (
                        "worldName", "revision", "syncToken", "handoffId", "bytes",
                        "sha256", "updatedAt", "toolId", "sourceCommit",
                    )
                })
            return payload

    def store(
        self, *, world_key: str, world_name: str | None, revision: int,
        sync_token: str, handoff_id: str, tool_id: str, source_commit: str, data: bytes,
    ) -> dict:
        world_key = decode_world_key(world_key)
        sync_token = require_token(sync_token, "sync token")
        handoff_id = require_token(handoff_id, "handoff ID")
        if tool_id != "orogen":
            raise RuntimeRequestError(400, "World sync only accepts the registered Orogen tool ID.")
        source_commit = require_source_commit(source_commit)
        if revision <= 0:
            raise RuntimeRequestError(400, "A positive sync revision is required.")
        digest = hashlib.sha256(data).hexdigest()
        filename = f"{hashlib.sha256(f'{world_key}:{sync_token}'.encode()).hexdigest()}.png"
        with self._lock:
            state = self._load_state()
            previous = state["worlds"].get(world_key)
            if isinstance(previous, dict):
                previous_revision = int(previous.get("revision") or 0)
                if revision < previous_revision:
                    raise RuntimeRequestError(
                        409, "A newer sync revision already exists for this world.",
                        self.status(world_key),
                    )
                if revision == previous_revision:
                    same_operation = (previous.get("syncToken") == sync_token
                                      and previous.get("handoffId") == handoff_id
                                      and previous.get("toolId") == tool_id
                                      and previous.get("sourceCommit") == source_commit
                                      and previous.get("sha256") == digest)
                    if not same_operation:
                        raise RuntimeRequestError(
                            409, "That sync revision belongs to a different or changed operation.",
                            self.status(world_key),
                        )
                    return self.status(world_key)
            self.sync_dir.mkdir(parents=True, exist_ok=True)
            destination = self.sync_dir / filename
            with tempfile.NamedTemporaryFile(
                "wb", delete=False, dir=self.sync_dir, suffix=".png.tmp"
            ) as handle:
                handle.write(data)
                handle.flush()
                temporary = Path(handle.name)
            temporary.replace(destination)
            record = {
                "worldKey": world_key,
                "worldName": str(world_name or world_key)[:180],
                "revision": revision,
                "syncToken": sync_token,
                "handoffId": handoff_id,
                "toolId": tool_id,
                "sourceCommit": source_commit,
                "file": filename,
                "bytes": len(data),
                "sha256": digest,
                "updatedAt": utc_now(),
            }
            state["worlds"][world_key] = record
            self._write_state(state)
            if isinstance(previous, dict) and previous.get("file") != filename:
                try:
                    (self.sync_dir / str(previous.get("file", ""))).unlink(missing_ok=True)
                except OSError:
                    pass
            return self.status(world_key)

    def clear(self, world_key: str, if_token: str | None = None) -> dict:
        world_key = validate_world_key(world_key)
        with self._lock:
            state = self._load_state()
            previous = state["worlds"].get(world_key)
            if isinstance(previous, dict) and previous.get("syncToken") != if_token:
                raise RuntimeRequestError(
                    409, "World sync changed before it could be disabled.", self.status(world_key)
                )
            if isinstance(previous, dict):
                del state["worlds"][world_key]
                self._write_state(state)
                try:
                    (self.sync_dir / str(previous.get("file", ""))).unlink(missing_ok=True)
                except OSError:
                    pass
            return {"syncing": False, "worldKey": world_key}

    def resolve_context(
        self, referer: str | None, expected_source_commit: str | None = None,
        expected_netloc: str | None = None,
    ) -> dict | None:
        """Validate and return one document-bound world/revision ownership tuple."""
        if not referer:
            return None
        try:
            parsed = urlparse(referer)
            if parsed.scheme not in ("http", "https") or (expected_netloc and parsed.netloc != expected_netloc):
                return None
            query = parse_qs(parsed.query, keep_blank_values=False)
            world_key = validate_world_key(query.get("wpWorldKey", [None])[0])
            revision = int(query.get("wpSyncRevision", [0])[0])
            sync_token = require_token(query.get("wpSyncToken", [None])[0], "sync token")
            handoff_id = require_token(query.get("wpHandoffId", [None])[0], "handoff ID")
            tool_id = query.get("wpToolId", [None])[0]
            source_commit = require_source_commit(query.get("wpSourceCommit", [None])[0])
        except (RuntimeRequestError, TypeError, ValueError):
            return None
        with self._lock:
            record = self._load_state()["worlds"].get(world_key)
            if not isinstance(record, dict):
                return None
            if (int(record.get("revision") or 0) != revision
                    or record.get("syncToken") != sync_token
                    or record.get("handoffId") != handoff_id):
                return None
            if record.get("toolId") != tool_id or record.get("sourceCommit") != source_commit:
                return None
            if not expected_source_commit or record.get("sourceCommit") != expected_source_commit.lower():
                return None
            candidate = self.sync_dir / str(record.get("file", ""))
            return dict(record) if candidate.is_file() else None

    def resolve_heightmap(
        self, referer: str | None, expected_source_commit: str | None = None,
        expected_netloc: str | None = None,
    ) -> Path | None:
        context = self.resolve_context(referer, expected_source_commit, expected_netloc)
        if not context:
            return None
        candidate = self.sync_dir / str(context.get("file", ""))
        return candidate if candidate.is_file() else None

    def redirect_location(
        self, destination: str, referer: str | None, expected_source_commit: str | None,
        expected_netloc: str | None,
    ) -> str:
        context = self.resolve_context(referer, expected_source_commit, expected_netloc)
        if not context:
            return destination
        query = urlencode({
            "wpWorldKey": context["worldKey"],
            "wpWorldName": context["worldName"],
            "wpSyncRevision": context["revision"],
            "wpSyncToken": context["syncToken"],
            "wpHandoffId": context["handoffId"],
            "wpToolId": context["toolId"],
            "wpSourceCommit": context["sourceCommit"],
        })
        return f"{destination}?{query}"


def check_orogen_update(pinned_commit: str | None, timeout: int = 12) -> dict:
    """Compare the checkout with one fixed upstream/ref; never mutate either repo."""
    if not pinned_commit or not re.fullmatch(r"[0-9a-fA-F]{40}", pinned_commit):
        raise RuntimeRequestError(409, "The pinned Orogen commit is unavailable.")
    try:
        result = subprocess.run(
            ["git", "ls-remote", "--exit-code", OROGEN_REPOSITORY, OROGEN_UPSTREAM_REF],
            capture_output=True, text=True, timeout=timeout, check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeRequestError(504, "The Orogen update check timed out.") from exc
    except OSError as exc:
        raise RuntimeRequestError(503, "Git is unavailable for the Orogen update check.") from exc
    if result.returncode != 0:
        raise RuntimeRequestError(502, "The Orogen upstream main ref could not be read.")
    upstream = result.stdout.split(maxsplit=1)[0].strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", upstream):
        raise RuntimeRequestError(502, "Orogen returned an invalid upstream revision.")
    pinned = pinned_commit.lower()
    return {
        "format": "world-portal-orogen-update-check",
        "version": 1,
        "checkedAt": utc_now(),
        "repository": OROGEN_REPOSITORY,
        "ref": OROGEN_UPSTREAM_REF,
        "pinnedCommit": pinned,
        "pinnedShort": pinned[:7],
        "upstreamCommit": upstream,
        "upstreamShort": upstream[:7],
        "updateAvailable": upstream != pinned,
        "actionTaken": False,
    }
