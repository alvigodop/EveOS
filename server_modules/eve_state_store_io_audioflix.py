import json
import logging
import os
import tempfile


SCHEMA = "eveos.audioflix.v1"
FILENAME = "audioflix.json"
LOGGER = logging.getLogger("EveOSStateStore")


def _state_from_payload(payload):
    if not isinstance(payload, dict):
        return None
    wrapped = payload.get("state")
    if payload.get("schema") == SCHEMA:
        return dict(wrapped) if isinstance(wrapped, dict) else None
    return dict(payload)


def read_audioflix_state(meta_dir, config=None):
    audioflix_file = meta_dir / FILENAME
    if audioflix_file.exists():
        try:
            payload = json.loads(audioflix_file.read_text(encoding="utf-8"))
            audioflix = _state_from_payload(payload)
            if audioflix is not None:
                return audioflix
            LOGGER.warning("Ignoring malformed Audioflix state in %s", audioflix_file)
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            LOGGER.warning("Ignoring unreadable Audioflix state in %s: %s", audioflix_file, error)

    legacy = (config or {}).get("audioflix")
    return dict(legacy) if isinstance(legacy, dict) else None


def write_audioflix_state(meta_dir, state):
    source = state if isinstance(state, dict) else {}
    audioflix = source.get("audioflix")
    if not isinstance(audioflix, dict):
        audioflix = ((source.get("bookmarks") or {}).get("config") or {}).get("audioflix")
    if not isinstance(audioflix, dict):
        return False

    target = meta_dir / FILENAME
    payload = json.dumps({"schema": SCHEMA, "state": audioflix}, ensure_ascii=False, indent=2)
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=meta_dir, prefix=f".{FILENAME}.", suffix=".tmp", delete=False
        ) as temp_file:
            temp_name = temp_file.name
            temp_file.write(payload)
            temp_file.flush()
            os.fsync(temp_file.fileno())
        os.replace(temp_name, target)
    finally:
        if temp_name and os.path.exists(temp_name):
            try:
                os.unlink(temp_name)
            except OSError:
                pass
    return True
