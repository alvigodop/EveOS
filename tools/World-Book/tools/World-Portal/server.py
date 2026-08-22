#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import http.server
import json
import os
import socketserver
import ssl
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

from tools.outer_tool_runtime import (OrogenSyncRuntime, RuntimeRequestError,
    check_orogen_update, decode_world_key, orogen_navigation_target, validate_world_key)
from eveos_runtime import EveOSPortalMixin, choose_listening_port

PROJECT_ROOT = Path(__file__).resolve().parent
PROJECT_MANIFEST = PROJECT_ROOT / "PROJECT-MANIFEST.json"
TEXTURE_PATH = PROJECT_ROOT / "assets" / "textures" / "earth-blue-marble.png"
TEXTURE_MANIFEST = PROJECT_ROOT / "assets" / "textures" / "texture-manifest.json"
TEXTURE_SOURCES = [
    {"name": "NASA Blue Marble Next Generation July 4K",
     "url": "https://svs.gsfc.nasa.gov/vis/a000000/a003400/a003487/earth4K.png", "minimum_bytes": 2_000_000},
    {"name": "NASA Blue Marble 2048 fallback",
     "url": "https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png", "minimum_bytes": 600_000},
]
CREDIT = (
    "NASA/Goddard Space Flight Center Scientific Visualization Studio. "
    "Blue Marble data courtesy Reto Stöckli (NASA/GSFC) and NASA Earth Observatory."
)
def project_version() -> str:
    try:
        metadata = json.loads(PROJECT_MANIFEST.read_text(encoding="utf-8"))
        return str(metadata.get("version") or "dev")
    except (OSError, ValueError, TypeError):
        return "dev"
OUTER_TOOLS_STATUS = PROJECT_ROOT / "assets" / "data" / "outer-tools.runtime.json"

SYNC_DIR = PROJECT_ROOT / "assets" / "data" / "outer-sync"
OROGEN_DEFAULT_ASSET = PROJECT_ROOT / "outer" / "orogen" / "assets" / "earth.png"
OROGEN_IMPORT_MAIN = PROJECT_ROOT / "outer" / "orogen" / "js" / "import-main.js"
SYNC_ENDPOINT = "/__outer/orogen/sync"
UPDATE_ENDPOINT = "/__outer/orogen/update"
MAX_SYNC_BYTES = 96 * 1024 * 1024
OROGEN_SYNC = OrogenSyncRuntime(SYNC_DIR)

def sync_supported() -> tuple[bool, str]:
    if not OROGEN_IMPORT_MAIN.is_file():
        return False, "Orogen is not initialized."
    try:
        source = OROGEN_IMPORT_MAIN.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return False, f"Could not read Orogen import module: {exc}"
    if "assets/earth.png" not in source:
        return False, (
            "Orogen no longer loads assets/earth.png at startup, so world sync "
            "cannot attach. Re-check the upstream default-heightmap path."
        )
    return True, "World sync ready."


def sync_active() -> bool:
    return bool(OROGEN_SYNC.status().get("syncing"))
OUTER_TOOLS = [
    {
        "id": "orogen",
        "name": "World Orogen",
        "kind": "world 3D planetary tool",
        "path": "outer/orogen",
        "entry": "outer/orogen/import.html",
        "generator": "outer/orogen/index.html",
        "license": "GPL-3.0",
        "repository": "https://github.com/raguilar011095/planet_heightmap_generation",
        "hosted": "https://www.orogen.studio/",
    },
]

def submodule_commit(path: Path) -> str | None:
    """Read the checked-out commit of a vendored outer tool, if git is available."""
    try:
        import subprocess

        result = subprocess.run(
            ["git", "-C", str(path), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=10, check=False,
        )
        return result.stdout.strip() or None if result.returncode == 0 else None
    except (OSError, ValueError, ImportError):
        return None


def write_outer_tools_status() -> list[dict]:
    """Publish outer-tool availability so the browser never needs to run git."""
    tools = []
    for tool in OUTER_TOOLS:
        directory = PROJECT_ROOT / tool["path"]
        entry = PROJECT_ROOT / tool["entry"]
        available = entry.is_file()
        commit = submodule_commit(directory) if available else None
        tools.append({
            **tool,
            "available": available,
            "commit": commit,
            "commitShort": commit[:7] if commit else None,
        })
        state = f"ready @ {commit[:7]}" if commit else ("ready" if available else "not initialized")
        print(f"[OuterTool] {tool['name']}: {state}")
    supported, reason = sync_supported()
    for tool in tools:
        if tool["id"] == "orogen":
            tool["syncSupported"] = supported
            tool["syncReason"] = reason
            tool["syncing"] = sync_active()
            tool["syncEndpoint"] = SYNC_ENDPOINT
            tool["updateEndpoint"] = UPDATE_ENDPOINT
            tool["bridgeProtocol"] = "world-portal.orogen-bridge"
            tool["bridgeProtocolVersion"] = 1
    print(f"[OuterTool] World sync: {'on' if sync_active() else 'off'} — {reason}")
    payload = {
        "format": "world-portal-outer-tools",
        "version": 2,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "tools": tools,
    }
    try:
        OUTER_TOOLS_STATUS.parent.mkdir(parents=True, exist_ok=True)
        OUTER_TOOLS_STATUS.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError as exc:
        print(f"[OuterTool] Could not write status file: {exc}")
    return tools


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path, minimum_bytes: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": f"World-Portal/{project_version()} (+local educational visualization)",
            "Accept": "image/png,image/*;q=0.9,*/*;q=0.5",
        },
    )

    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, dir=destination.parent, suffix=".download") as temp:
            temp_path = Path(temp.name)
            with urllib.request.urlopen(request, timeout=90, context=ssl.create_default_context()) as response:
                total = int(response.headers.get("Content-Length", "0") or 0)
                received = 0
                while True:
                    chunk = response.read(256 * 1024)
                    if not chunk:
                        break
                    temp.write(chunk)
                    received += len(chunk)
                    if total:
                        percent = received * 100 / total
                        print(f"\r[Assets] Downloading Earth texture: {percent:5.1f}%", end="", flush=True)
            print()
            temp.flush()

        size = temp_path.stat().st_size
        if size < minimum_bytes:
            raise RuntimeError(f"Downloaded file was unexpectedly small ({size} bytes).")

        temp_path.replace(destination)
    except Exception:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
        raise


def ensure_texture(refresh: bool = False) -> dict:
    if TEXTURE_PATH.exists() and TEXTURE_PATH.stat().st_size > 600_000 and not refresh:
        print(f"[Assets] Using cached NASA texture: {TEXTURE_PATH.name}")
        if TEXTURE_MANIFEST.exists():
            return json.loads(TEXTURE_MANIFEST.read_text(encoding="utf-8"))
        return {"file": TEXTURE_PATH.name, "sha256": sha256(TEXTURE_PATH), "credit": CREDIT}

    errors: list[str] = []
    for source in TEXTURE_SOURCES:
        print(f"[Assets] Fetching {source['name']}...")
        try:
            download(source["url"], TEXTURE_PATH, source["minimum_bytes"])
            manifest = {
                "file": TEXTURE_PATH.name,
                "sourceName": source["name"],
                "sourceUrl": source["url"],
                "sha256": sha256(TEXTURE_PATH),
                "bytes": TEXTURE_PATH.stat().st_size,
                "credit": CREDIT,
            }
            TEXTURE_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            print(f"[Assets] Cached {TEXTURE_PATH.name} ({manifest['bytes']:,} bytes)")
            return manifest
        except Exception as exc:
            errors.append(f"{source['name']}: {exc}")
            print(f"[Assets] Failed: {exc}")

    raise RuntimeError(
        "Could not download the NASA Earth texture. Check internet access and retry.\n"
        + "\n".join(errors)
        + f"\nYou may also manually download either official PNG and save it as:\n{TEXTURE_PATH}"
    )


class NoCacheHandler(EveOSPortalMixin, http.server.SimpleHTTPRequestHandler):
    portal_app_version = staticmethod(project_version)
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".css": "text/css",
        ".png": "image/png",
    }

    def send_head(self):
        """Keep Orogen's root-relative native tabs inside the mounted tool."""
        destination = orogen_navigation_target(
            self.path, self.headers.get("Referer"), self.headers.get("Host")
        )
        if destination and (PROJECT_ROOT / destination.lstrip("/")).is_file():
            live_commit = submodule_commit(PROJECT_ROOT / "outer" / "orogen")
            location = OROGEN_SYNC.redirect_location(
                destination, self.headers.get("Referer"), live_commit, self.headers.get("Host")
            )
            self.send_response(302)
            self.send_header("Location", location)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        return super().send_head()

    def translate_path(self, path: str) -> str:
        """Substitute only the sync record bound to this iframe document."""
        resolved = super().translate_path(path)
        try:
            if Path(resolved).resolve() == OROGEN_DEFAULT_ASSET.resolve():
                live_commit = submodule_commit(PROJECT_ROOT / "outer" / "orogen")
                synced = OROGEN_SYNC.resolve_heightmap(
                    self.headers.get("Referer"), live_commit, self.headers.get("Host")
                )
                if synced:
                    return str(synced)
        except OSError:
            pass
        return resolved

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _endpoint(self) -> tuple[str, dict[str, list[str]]]:
        parsed = urllib.parse.urlparse(self.path)
        return parsed.path, urllib.parse.parse_qs(parsed.query)

    def do_GET(self) -> None:  # noqa: N802
        if self._eveos_health():
            return
        path, query = self._endpoint()
        if path == SYNC_ENDPOINT:
            try:
                encoded = query.get("worldKey", [None])[0]
                world_key = validate_world_key(encoded)
                state = OROGEN_SYNC.status(world_key)
                supported, reason = sync_supported()
                live_commit = submodule_commit(PROJECT_ROOT / "outer" / "orogen")
                if state.get("syncing") and state.get("sourceCommit") != live_commit:
                    state["syncing"] = False
                    reason = "Pinned Orogen changed; reload World Portal before syncing."
                self._json(200, {
                    **state, "supported": supported, "reason": reason,
                    "liveSourceCommit": live_commit,
                })
            except (RuntimeRequestError, OSError) as exc:
                status = exc.status if isinstance(exc, RuntimeRequestError) else 500
                self._json(status, {"error": str(exc), "syncing": False})
            return
        if path == UPDATE_ENDPOINT:
            try:
                self._json(200, check_orogen_update(submodule_commit(PROJECT_ROOT / "outer" / "orogen")))
            except RuntimeRequestError as exc:
                self._json(exc.status, {"error": str(exc), **exc.state})
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        path, _query = self._endpoint()
        if path != SYNC_ENDPOINT:
            self._json(404, {"error": "Unknown endpoint."})
            return
        supported, reason = sync_supported()
        if not supported:
            self._json(409, {"error": reason, "syncing": False})
            return
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            self._json(400, {"error": "Invalid Content-Length.", "syncing": False})
            return
        if length <= 0 or length > MAX_SYNC_BYTES:
            self._json(413, {"error": "Sync payload missing or too large.", "syncing": sync_active()})
            return
        data = self.rfile.read(length)
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            self._json(415, {"error": "World sync expects a PNG heightmap.", "syncing": sync_active()})
            return
        try:
            source_commit = self.headers.get("X-World-Portal-Source-Commit", "").lower()
            if source_commit != (live_commit := (submodule_commit(PROJECT_ROOT / "outer" / "orogen") or "").lower()):
                raise RuntimeRequestError(409, "Pinned Orogen changed; reload World Portal before syncing.")
            result = OROGEN_SYNC.store(
                world_key=self.headers.get("X-World-Portal-World-Key", ""),
                world_name=urllib.parse.unquote(self.headers.get("X-World-Portal-World-Name", "")),
                revision=int(self.headers.get("X-World-Portal-Revision", "0")),
                sync_token=self.headers.get("X-World-Portal-Sync-Token", ""),
                handoff_id=self.headers.get("X-World-Portal-Handoff-Id", ""),
                tool_id=self.headers.get("X-World-Portal-Tool-Id", ""),
                source_commit=source_commit,
                data=data,
            )
        except (RuntimeRequestError, OSError, ValueError) as exc:
            status = exc.status if isinstance(exc, RuntimeRequestError) else 500
            state = exc.state if isinstance(exc, RuntimeRequestError) else {}
            self._json(status, {"error": str(exc), "syncing": False,
                "worldKey": urllib.parse.unquote(self.headers.get("X-World-Portal-World-Key", "")),
                "liveSourceCommit": locals().get("live_commit") or None, **state})
            return
        print(f"[OuterTool] World sync ON for {result['worldKey']} ({len(data):,} bytes).")
        self._json(200, {**result, "message": reason, "liveSourceCommit": source_commit})

    def do_DELETE(self) -> None:  # noqa: N802
        path, query = self._endpoint()
        if path != SYNC_ENDPOINT:
            self._json(404, {"error": "Unknown endpoint."})
            return
        try:
            encoded = query.get("worldKey", [None])[0]
            result = OROGEN_SYNC.clear(
                encoded,
                self.headers.get("X-World-Portal-If-Token") or None,
            )
        except (RuntimeRequestError, OSError) as exc:
            status = exc.status if isinstance(exc, RuntimeRequestError) else 500
            state = exc.state if isinstance(exc, RuntimeRequestError) else {}
            self._json(status, {"error": str(exc), "syncing": sync_active(), **state})
            return
        print(f"[OuterTool] World sync OFF for {result['worldKey']}.")
        self._json(200, {**result, "message": "Orogen restored to its own default for this world."})

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        super().end_headers()

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[WorldPortal] {self.address_string()} - {fmt % args}")


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def main() -> None:
    parser = argparse.ArgumentParser(description="Run World Portal, a multi-world relational geography system.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8770)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--refresh-texture", action="store_true")
    parser.add_argument("--strict-port", action="store_true")
    args = parser.parse_args()

    os.chdir(PROJECT_ROOT)

    try:
        manifest = ensure_texture(refresh=args.refresh_texture)
    except Exception as exc:
        print("\nWorld Portal could not prepare its NASA texture:\n", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        print("\nPress Enter to close.", file=sys.stderr)
        try:
            input()
        except EOFError:
            pass
        raise SystemExit(1)

    write_outer_tools_status()

    port = choose_listening_port(args.host, args.port, args.strict_port)
    url = f"http://{args.host}:{port}/"
    server = ThreadingServer((args.host, port), NoCacheHandler)
    version = project_version()

    print("=" * 66)
    print(f"World Portal v{version} — Multi-World Geography System")
    print(f"Project: {PROJECT_ROOT}")
    print(f"Texture: {manifest.get('sourceName', manifest.get('file'))}")
    print(f"Open:    {url}")
    print("Press Ctrl+C to stop the server.")
    print("=" * 66)

    if not args.no_browser:
        threading.Thread(target=lambda: (time.sleep(0.7), webbrowser.open(url)), daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[WorldPortal] Stopping server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
