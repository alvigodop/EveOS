#!/usr/bin/env python3
"""Verify deterministic, atomic Gemini chat-history storage."""

import importlib
import json
import os
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
INTERACTIONS_ROOT = REPO_ROOT / "server" / "gemini-backend" / "interactions"
sys.path.insert(0, str(INTERACTIONS_ROOT))


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    original_cwd = Path.cwd()
    with tempfile.TemporaryDirectory(prefix="eveos-gemini-history-") as temp_value:
        temp_root = Path(temp_value)
        runtime_root = temp_root / "runtime"
        legacy_file = temp_root / "chat_history.json"
        legacy_entry = {
            "timestamp": "2026-01-01T00:00:00",
            "role": "user",
            "content": "legacy message",
        }
        legacy_file.write_text(json.dumps([legacy_entry]), encoding="utf-8")

        os.environ["EVEOS_RUNTIME_DIR"] = str(runtime_root)
        os.environ["EVEOS_LEGACY_CHAT_HISTORY_FILES"] = str(legacy_file)
        os.chdir(temp_root)
        try:
            config = importlib.import_module(
                "main_server_files.server_initialization.server_config"
            )
            handler = importlib.import_module(
                "main_server_files.chat_history.chat_history_handler"
            )

            migrated = handler.load_chat_history()
            assert_true(migrated == [legacy_entry], "legacy history was not migrated")
            assert_true(
                Path(config.get_chat_history_file()).parent == runtime_root.resolve(),
                "history path is not rooted in EVEOS_RUNTIME_DIR",
            )

            writes = 40
            with ThreadPoolExecutor(max_workers=8) as pool:
                list(pool.map(
                    lambda index: handler.save_chat_history(f"message-{index}", is_user=True),
                    range(writes),
                ))

            stored = handler.load_chat_history()
            assert_true(len(stored) == writes + 1, "concurrent writes lost history entries")
            assert_true(
                len({item["content"] for item in stored[1:]}) == writes,
                "concurrent writes duplicated or corrupted entries",
            )
            leftovers = list(runtime_root.glob("*.tmp"))
            assert_true(not leftovers, "atomic writer left temporary files behind")

            handler.clear_chat_history()
            assert_true(handler.load_chat_history() == [], "clear did not persist")
        finally:
            os.chdir(original_cwd)
            os.environ.pop("EVEOS_RUNTIME_DIR", None)
            os.environ.pop("EVEOS_LEGACY_CHAT_HISTORY_FILES", None)

    print("GEMINI_CHAT_HISTORY_STORAGE_SMOKE_OK")


if __name__ == "__main__":
    main()
