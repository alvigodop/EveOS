import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules.eve_state_store_io_read import read_modular_state_raw
from server_modules.eve_state_store_io_write import write_modular_state_full
from server_modules.eve_state_store_layers_extract import extract_layer_state
from server_modules.eve_state_store_layers_merge import merge_layer_state


def make_state(*, legacy=False):
    audioflix = {
        "schemaVersion": 1,
        "soundboard": [{"id": "sound-1", "type": "sound", "title": "Clip", "url": "media/clip.wav"}],
        "music": [{"id": "music-1", "type": "music", "title": "Track", "url": "https://example.test/track"}],
        "ports": [{"id": "port-1", "nickname": "Local", "path": "C:/Audio"}],
        "soundboardGroups": ["Tests"],
    }
    config = {
        "activeWorkspace": "main",
        "workspaces": [{"id": "main", "name": "Main", "icon": "home", "subTabs": []}],
    }
    state = {
        "metadata": {"version": 1},
        "bookmarks": {"links": [], "config": config, "folders": {}, "pins": []},
        "library": {"categories": {}, "connections": []},
        "knowledge": {"scopedStorage": {}},
    }
    if legacy:
        config["audioflix"] = audioflix
    else:
        state["audioflix"] = audioflix
    return state, audioflix


def write_store(root, state):
    meta = root / "_meta"
    tabs = root / "tabs"

    def clean():
        shutil.rmtree(root, ignore_errors=True)
        meta.mkdir(parents=True, exist_ok=True)
        tabs.mkdir(parents=True, exist_ok=True)

    return write_modular_state_full(
        state,
        store_root=root,
        meta_dir=meta,
        tabs_dir=tabs,
        format_version=1,
        ensure_clean_store=clean,
        collect_status=lambda: {"exists": root.exists()},
    )


def read_store(root):
    return read_modular_state_raw(
        store_root=root,
        meta_dir=root / "_meta",
        tabs_dir=root / "tabs",
        format_version=1,
    )


def assert_audioflix(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label} Audioflix mismatch: {actual!r}")


def main():
    with tempfile.TemporaryDirectory(prefix="eveos-audioflix-backup-") as temp_dir:
        base = Path(temp_dir)
        source_root = base / "source"
        backup_root = base / "backup"
        legacy_root = base / "legacy"
        source, expected = make_state()

        write_store(source_root, source)
        audio_file = source_root / "_meta" / "audioflix.json"
        payload = json.loads(audio_file.read_text(encoding="utf-8"))
        if payload.get("schema") != "eveos.audioflix.v1":
            raise AssertionError("Audioflix modular file is missing its schema")
        config_payload = json.loads((source_root / "_meta" / "config.json").read_text(encoding="utf-8"))
        if "audioflix" in config_payload:
            raise AssertionError("Audioflix was duplicated into config.json")

        restored_source = read_store(source_root)
        assert_audioflix(restored_source.get("audioflix"), expected, "source round-trip")

        full_backup = extract_layer_state(restored_source, "store")
        assert_audioflix(full_backup.get("audioflix"), expected, "full backup extraction")
        if "audioflix" in extract_layer_state(restored_source, "tab", workspace_id="main"):
            raise AssertionError("scoped tab backup leaked global Audioflix state")

        write_store(backup_root, full_backup)
        restored_backup = read_store(backup_root)
        assert_audioflix(restored_backup.get("audioflix"), expected, "backup restore")

        merged = merge_layer_state(restored_source, full_backup, "store")
        assert_audioflix(merged.get("audioflix"), expected, "full store merge")

        legacy, legacy_expected = make_state(legacy=True)
        write_store(legacy_root, legacy)
        migrated = read_store(legacy_root)
        assert_audioflix(migrated.get("audioflix"), legacy_expected, "legacy migration")
        migrated_config = json.loads((legacy_root / "_meta" / "config.json").read_text(encoding="utf-8"))
        if "audioflix" in migrated_config:
            raise AssertionError("legacy Audioflix remained duplicated after migration")

        audio_file.write_text('{"schema":"eveos.audioflix.v1","state":', encoding="utf-8")
        corrupt_read = read_store(source_root)
        if "audioflix" in corrupt_read:
            raise AssertionError("malformed optional Audioflix metadata leaked into restored state")
        if corrupt_read.get("bookmarks", {}).get("config", {}).get("activeWorkspace") != "main":
            raise AssertionError("malformed Audioflix metadata blocked the core datapack restore")

    print("AUDIOFLIX_MODULAR_BACKUP_SMOKE_OK")


if __name__ == "__main__":
    main()
