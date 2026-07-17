import json
import os
import datetime
import shutil
import tempfile
import threading
from pathlib import Path

from ..server_initialization import server_config

_history_lock = threading.RLock()


def _ensure_history_file():
    target = Path(server_config.get_chat_history_file())
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        return target

    for legacy_value in server_config.get_legacy_chat_history_files():
        legacy = Path(legacy_value)
        if not legacy.is_file() or legacy.resolve() == target.resolve():
            continue
        try:
            shutil.copy2(legacy, target)
            print(f"Migrated Gemini chat history to {target}")
            break
        except OSError as exc:
            print(f"Unable to migrate Gemini chat history from {legacy}: {exc}")
    return target


def _read_history_unlocked(target):
    if not target.exists():
        return []
    with target.open('r', encoding='utf-8') as handle:
        payload = json.load(handle)
    return payload if isinstance(payload, list) else []


def _write_history_unlocked(target, history):
    descriptor, temp_name = tempfile.mkstemp(
        prefix=f".{target.name}.",
        suffix=".tmp",
        dir=str(target.parent),
        text=True,
    )
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            json.dump(history, handle, indent=2, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, target)
    except Exception:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise

def save_chat_history(message, is_user=False):
    """Save a message to chat history"""
    try:
        with _history_lock:
            target = _ensure_history_file()
            history = _read_history_unlocked(target)
            history.append({
                'timestamp': datetime.datetime.now().isoformat(),
                'role': 'user' if is_user else 'gemini',
                'content': message
            })
            _write_history_unlocked(target, history)
    except Exception as e:
        print(f"Error saving chat history: {e}")

def load_chat_history():
    """Load chat history from file"""
    try:
        with _history_lock:
            return _read_history_unlocked(_ensure_history_file())
    except Exception as e:
        print(f"Error loading chat history: {e}")
        return []

def clear_chat_history():
    """Clear the chat history file"""
    try:
        with _history_lock:
            _write_history_unlocked(_ensure_history_file(), [])
        print("Chat history cleared successfully")
    except Exception as e:
        print(f"Error clearing chat history: {e}")
