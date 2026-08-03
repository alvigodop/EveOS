from __future__ import annotations

import json
from pathlib import Path


def load_runtime() -> dict:
    base = Path(__file__).resolve().parent
    layers_dir = base / "layers"
    manifest = json.loads((layers_dir / "manifest.json").read_text(encoding="utf-8"))
    namespace = {
        "__name__": "eve_worldbook_layered_runtime",
        "__file__": str(base.parent / "server.py"),
        "__package__": None,
    }
    for relative in manifest:
        path = layers_dir / relative
        source = path.read_text(encoding="utf-8")
        exec(compile(source, str(path), "exec"), namespace, namespace)
    return namespace


def run() -> None:
    runtime = load_runtime()
    runtime["main"]()
