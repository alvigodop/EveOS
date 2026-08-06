"""
Server configuration settings and constants.
"""

import os
from pathlib import Path

# Global cleanup interval for session cleanup task (seconds)
CLEANUP_INTERVAL_SEC = 60

# Default WebSocket server port. Must match tools/batch/eveos-ports.bat (GEMINI_WS_PORT); moved off
# 9083 because the Document-Audiobook-Converter project claims 9083/9084 on this machine.
DEFAULT_PORT = 9085

# Default status server port (WebSocket port + 1)
STATUS_PORT = DEFAULT_PORT + 1

# Runtime state must not depend on the shell's current directory. Accessors are
# intentionally dynamic so tests, launchers, and long-lived host processes can
# redirect runtime storage without reloading this module.
PROJECT_ROOT = Path(__file__).resolve().parents[5]


def get_runtime_dir():
    return Path(
        os.environ.get("EVEOS_RUNTIME_DIR", str(PROJECT_ROOT / "data" / "runtime"))
    ).expanduser().resolve()


def get_chat_history_file():
    return str(get_runtime_dir() / "gemini-chat-history.json")


def get_legacy_chat_history_files():
    configured = os.environ.get("EVEOS_LEGACY_CHAT_HISTORY_FILES", "")
    candidates = [value for value in configured.split(os.pathsep) if value]
    candidates.extend([
        str(PROJECT_ROOT / "chat_history.json"),
        str(Path.cwd() / "chat_history.json"),
    ])
    return tuple(dict.fromkeys(candidates))


# Compatibility constants for callers that only inspect startup configuration.
RUNTIME_DIR = get_runtime_dir()
CHAT_HISTORY_FILE = get_chat_history_file()
LEGACY_CHAT_HISTORY_FILES = get_legacy_chat_history_files()
