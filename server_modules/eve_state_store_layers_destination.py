import json
import os
import shutil
import time
from datetime import datetime
from pathlib import Path

from server_modules.eve_state_store_layers_shared import _slugify

def _resolve_nonempty_path(path_value):
    raw = str(path_value or "").strip().strip('"')
    if not raw:
        raise ValueError("destinationPath is required for layer backup.")
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = Path(os.getcwd()) / path
    return path.resolve()

def default_backup_folder_name(layer):
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_layer = _slugify(layer or "layer", "layer")
    return f"{stamp}-{safe_layer}"

def resolve_destination_path(path_value):
    return _resolve_nonempty_path(path_value)

def build_unique_child_destination(parent_dir, layer):
    parent = Path(parent_dir).resolve()
    base_name = default_backup_folder_name(layer)
    candidate = parent / base_name
    counter = 1
    while candidate.exists():
        candidate = parent / f"{base_name}-{counter}"
        counter += 1
    return candidate

def ensure_destination_ready(destination, overwrite=False, layer="layer"):
    dest = Path(destination).resolve()
    if dest.exists() and not dest.is_dir():
        raise ValueError(f"Destination path is not a directory: {dest}")

    if overwrite:
        if dest.exists() and any(dest.iterdir()):
            shutil.rmtree(dest)
        dest.mkdir(parents=True, exist_ok=True)
        return dest

    dest.mkdir(parents=True, exist_ok=True)
    child = build_unique_child_destination(dest, layer)
    child.mkdir(parents=True, exist_ok=False)
    return child
