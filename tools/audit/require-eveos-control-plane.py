#!/usr/bin/env python3
"""Passive prerequisite check for file:// browser qualification lanes."""

from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
PORTS_PATH = ROOT / "config" / "eveos-ports.json"


def resolve_port() -> int:
    override = str(os.environ.get("GEMINI_CONTROL_PORT", "")).strip()
    if override:
        return int(override)
    data = json.loads(PORTS_PATH.read_text(encoding="utf-8"))
    return int(data["ports"]["GEMINI_CONTROL_PORT"]["port"])


def main() -> None:
    port = resolve_port()
    url = f"http://127.0.0.1:{port}/api/control-plane/health"
    try:
        with urlopen(url, timeout=2.5) as response:
            payload = json.load(response)
    except (OSError, URLError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(
            "EVEOS_CONTROL_PLANE_REQUIRED "
            f"port={port} error={error!s}\n"
            r"Start it with: .\tools\batch\start-eveos-control.bat"
        )

    if payload.get("service") != "eveos-control-plane" or payload.get("running") is not True:
        raise SystemExit(
            "EVEOS_CONTROL_PLANE_REQUIRED "
            f"port={port} service={payload.get('service')!r} running={payload.get('running')!r}\n"
            r"Start it with: .\tools\batch\start-eveos-control.bat"
        )

    print(f"EVEOS_CONTROL_PLANE_READY port={port}")


if __name__ == "__main__":
    main()
