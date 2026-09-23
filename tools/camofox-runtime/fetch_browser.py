#!/usr/bin/env python3
"""Fetch the official Camoufox release into EveOS without Node/native build tools.

The release/asset selection mirrors the pinned camoufox-js browser downloader:
stable GitHub release, supported pre-1 browser release, matching OS/architecture
asset, root-level executable and version.json. Neither the npm cache nor the
per-user Camoufox cache is used for browser storage.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import stat
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent
BROWSER_ROOT = ROOT / "browser"
RELEASES_URL = "https://api.github.com/repos/daijro/camoufox/releases?per_page=30"
OFFICIAL_ASSET_PREFIX = "/daijro/camoufox/releases/download/"


def platform_target() -> tuple[str, str, str]:
    system = {"Windows": "win", "Linux": "lin", "Darwin": "mac"}.get(platform.system())
    arch = {"AMD64": "x86_64", "x86_64": "x86_64", "i386": "i686",
            "i686": "i686", "arm64": "arm64", "aarch64": "arm64"}.get(platform.machine())
    if not system or not arch:
        raise RuntimeError(f"Unsupported Camoufox platform: {platform.system()} / {platform.machine()}")
    if system in {"win", "mac"} and arch == "i686":
        raise RuntimeError(f"Unsupported Camoufox architecture: {system} / {arch}")
    executable = {"win": "camoufox.exe",
                  "lin": "camoufox-bin",
                  "mac": "Camoufox.app/Contents/MacOS/camoufox"}[system]
    return system, arch, executable


def browser_ready(browser_root: Path, executable: str) -> bool:
    manifest = browser_root / "version.json"
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
        return bool(data.get("version") and data.get("release")
                    and (browser_root / executable).is_file())
    except (OSError, ValueError, AttributeError):
        return False


def select_asset(releases: list[dict], system: str, arch: str) -> dict:
    # Upstream camoufox-js 0.11.5 accepts alpha/beta releases before 1.
    pattern = re.compile(
        rf"camoufox-(?P<version>.+)-(?P<release>alpha\.\d+|beta\.\d+)-{system}\.{arch}\.zip"
    )
    for release in releases:
        if release.get("draft") or release.get("prerelease"):
            continue
        for asset in release.get("assets") or []:
            matched = pattern.fullmatch(str(asset.get("name") or ""))
            if not matched:
                continue
            url = str(asset.get("browser_download_url") or "")
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme != "https" or parsed.hostname != "github.com" or not parsed.path.startswith(OFFICIAL_ASSET_PREFIX):
                raise RuntimeError("Official release metadata supplied an unexpected asset URL")
            return {"url": url, **matched.groupdict(), "name": asset["name"]}
    raise RuntimeError(
        f"No supported official Camoufox browser asset for {system}.{arch}. "
        "Do not install an unverified or incompatible browser."
    )


def fetch_release_metadata() -> list[dict]:
    headers = {"User-Agent": "EveOS-local-Camoufox-installer",
               "Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(RELEASES_URL, headers=headers)
    with urllib.request.urlopen(request, timeout=35) as response:
        payload = json.load(response)
    if not isinstance(payload, list):
        raise RuntimeError("GitHub returned invalid Camoufox release metadata")
    return payload


def download_archive(url: str, destination: Path) -> None:
    request = urllib.request.Request(
        url, headers={"User-Agent": "EveOS-local-Camoufox-installer"})
    transferred = 0
    last_report = 0
    with urllib.request.urlopen(request, timeout=70) as response, destination.open("wb") as target:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            target.write(chunk)
            transferred += len(chunk)
            if transferred - last_report >= 64 * 1024 * 1024:
                print(f"[Camofox] Downloaded {transferred // (1024 * 1024)} MiB...", flush=True)
                last_report = transferred
    if transferred < 1024 * 1024:
        raise RuntimeError("Browser archive download was unexpectedly small")


def extract_verified(archive: Path, destination: Path) -> None:
    with zipfile.ZipFile(archive) as source:
        files = source.infolist()
        if not files:
            raise RuntimeError("Downloaded browser archive is empty")
        for entry in files:
            name = entry.filename.replace("\\", "/")
            parts = PurePosixPath(name).parts
            if (not name or name.startswith("/") or any(part in ("..", "") for part in parts)
                    or ":" in name or ((entry.external_attr >> 16) & 0o170000) == stat.S_IFLNK):
                raise RuntimeError(f"Unsafe path in browser archive: {entry.filename!r}")
        source.extractall(destination)


def install() -> None:
    system, arch, executable = platform_target()
    if browser_ready(BROWSER_ROOT, executable):
        print(f"CAMOFOX_LOCAL_BROWSER_OK {BROWSER_ROOT}")
        return

    asset = select_asset(fetch_release_metadata(), system, arch)
    print(f"[Camofox] Official browser asset: {asset['name']}", flush=True)
    # Keep the download/extraction inside EveOS and only replace browser/ after validation.
    with tempfile.TemporaryDirectory(prefix=".camofox-staging-", dir=ROOT) as raw:
        staging = Path(raw)
        archive = staging / "release.zip"
        unpacked = staging / "unpacked"
        unpacked.mkdir()
        download_archive(asset["url"], archive)
        extract_verified(archive, unpacked)
        if not (unpacked / executable).is_file():
            raise RuntimeError(f"Official browser archive has no {executable}")
        (unpacked / "version.json").write_text(
            json.dumps({"version": asset["version"], "release": asset["release"]}),
            encoding="utf-8",
        )
        previous = staging / "previous-browser"
        if BROWSER_ROOT.exists():
            BROWSER_ROOT.replace(previous)
        try:
            unpacked.replace(BROWSER_ROOT)
        except OSError:
            if previous.exists() and not BROWSER_ROOT.exists():
                previous.replace(BROWSER_ROOT)
            raise
    print(f"CAMOFOX_LOCAL_BROWSER_OK {BROWSER_ROOT}")


def self_test() -> None:
    good = {"draft": False, "prerelease": False, "assets": [{
        "name": "camoufox-135.0.1-beta.25-win.x86_64.zip",
        "browser_download_url": (
            "https://github.com/daijro/camoufox/releases/download/test/"
            "camoufox-135.0.1-beta.25-win.x86_64.zip"
        ),
    }]}
    selected = select_asset([good], "win", "x86_64")
    assert selected["version"] == "135.0.1" and selected["release"] == "beta.25"
    try:
        select_asset([{"prerelease": True, "assets": good["assets"]}], "win", "x86_64")
        raise AssertionError("Prerelease metadata was accepted")
    except RuntimeError:
        pass
    with tempfile.TemporaryDirectory(prefix=".camofox-self-test-", dir=ROOT) as raw:
        root = Path(raw)
        archive = root / "traversal.zip"
        with zipfile.ZipFile(archive, "w") as target:
            target.writestr("../escape.txt", "unsafe")
        try:
            extract_verified(archive, root / "unpacked")
            raise AssertionError("Browser archive traversal was accepted")
        except RuntimeError:
            pass
    print("CAMOFOX_LOCAL_INSTALLER_SELF_TEST_OK")


def main() -> int:
    parser = argparse.ArgumentParser(description="EveOS-local official Camoufox browser fetcher")
    parser.add_argument("--check", action="store_true", help="Check local browser only")
    parser.add_argument("--self-test", action="store_true", help="Offline security and selection checks")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.check:
        _, _, executable = platform_target()
        ready = browser_ready(BROWSER_ROOT, executable)
        print(f"CAMOFOX_LOCAL_BROWSER_{'OK' if ready else 'MISSING'} {BROWSER_ROOT}")
        return 0 if ready else 1
    install()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, urllib.error.URLError,
            zipfile.BadZipFile) as error:
        print(f"CAMOFOX_LOCAL_BROWSER_FETCH_FAILED: {error}", file=sys.stderr)
        sys.exit(1)
