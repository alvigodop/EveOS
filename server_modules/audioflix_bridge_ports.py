import json
import os
import threading
from http import HTTPStatus

AUDIO_EXTENSIONS = {".mp3", ".mp4", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".webm"}

# Directories the user has explicitly registered as soundboard "ports" or localized music folders.
# The file endpoint will only serve files that live inside one of these (and only audio files), so a
# crafted ?path= cannot read arbitrary files off the machine.
#
# This registry is PERSISTED. It used to live only in memory, which meant every server restart
# de-authorized every localized music folder: the tracks still had valid localPaths, but /port/file
# answered 403 ("not inside a registered port directory") until the user re-ran Localize, so songs
# silently refused to play. Soundboard path ports were re-registered on panel open (port/list), which
# is why only music was affected. Persisting the set makes localized playback survive a restart.
_ALLOWED_DIRS: set[str] = set()
_REGISTRY_LOCK = threading.Lock()
_REGISTRY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audioflix_allowed_dirs.json")
_MAX_REGISTRY = 500


def _load_registry() -> None:
    """Restore the authorized-directory set, dropping any folder that no longer exists."""
    try:
        with open(_REGISTRY_PATH, "r", encoding="utf-8") as handle:
            saved = json.load(handle)
    except (OSError, ValueError):
        return
    if not isinstance(saved, list):
        return
    kept = [e for e in saved if isinstance(e, str) and os.path.isdir(e)]
    _ALLOWED_DIRS.update(kept)
    if len(kept) != len(saved):
        _save_registry()      # write the pruned set back so deleted folders don't linger forever


def _save_registry() -> None:
    try:
        with open(_REGISTRY_PATH, "w", encoding="utf-8") as handle:
            json.dump(sorted(_ALLOWED_DIRS), handle, indent=1)
    except OSError:
        pass          # a read-only checkout just loses persistence, never breaks playback


def authorize_dir(path: str) -> None:
    """Register a directory as servable and persist it (idempotent, bounded)."""
    if not path:
        return
    with _REGISTRY_LOCK:
        canon = _canon(path)
        if canon in _ALLOWED_DIRS:
            return
        if len(_ALLOWED_DIRS) >= _MAX_REGISTRY:
            return
        _ALLOWED_DIRS.add(canon)
        _save_registry()

_CONTENT_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".webm": "audio/webm",
}


_CHUNK = 256 * 1024


def _parse_range(range_header: str, size: int):
    """Parse a single-range 'bytes=start-end' header -> (start, end) inclusive, or None.

    Returns the sentinel 'invalid' when the range is syntactically fine but unsatisfiable, so the
    caller can answer 416 instead of silently sending the whole file.
    """
    value = str(range_header or "").strip().lower()
    if not value.startswith("bytes=") or "," in value:
        return None
    spec = value[6:].strip()
    if "-" not in spec:
        return None
    first, _, last = spec.partition("-")
    try:
        if not first:                       # suffix form: bytes=-500 (final N bytes)
            length = int(last)
            if length <= 0:
                return "invalid"
            start, end = max(0, size - length), size - 1
        else:
            start = int(first)
            end = int(last) if last else size - 1
    except ValueError:
        return None
    if start > end or start >= size:
        return "invalid"
    return start, min(end, size - 1)


def _serve_file_ranged(handler, real_path: str, content_type: str) -> None:
    """Serve a file with HTTP Range support, streamed in chunks.

    Range support is what makes a media element SEEKABLE: without 'Accept-Ranges' and 206 replies,
    Chrome cannot jump to a position, so dragging the seek bar on a ported/localized track silently
    snapped back (it worked in the internal view only because that seeks through the provider's own
    player API instead of HTTP). Streaming in chunks also stops a long track being read fully into
    memory just to be written out again.
    """
    size = os.path.getsize(real_path)
    parsed = _parse_range(handler.headers.get("Range"), size)

    if parsed == "invalid":
        handler.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
        handler.send_header("Content-Range", f"bytes */{size}")
        handler.send_header("Content-Length", "0")
        handler.end_headers()
        return

    start, end = parsed if parsed else (0, size - 1)
    length = end - start + 1
    handler.send_response(HTTPStatus.PARTIAL_CONTENT if parsed else HTTPStatus.OK)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Accept-Ranges", "bytes")
    handler.send_header("Content-Length", str(length))
    if parsed:
        handler.send_header("Content-Range", f"bytes {start}-{end}/{size}")
    handler.end_headers()

    with open(real_path, "rb") as handle:
        handle.seek(start)
        remaining = length
        while remaining > 0:
            block = handle.read(min(_CHUNK, remaining))
            if not block:
                break
            try:
                handler.wfile.write(block)
            except (BrokenPipeError, ConnectionResetError):
                return          # the player closed the stream (seek/stop) — not an error
            remaining -= len(block)


def _canon(p: str) -> str:
    return os.path.realpath(os.path.abspath(p))


_load_registry()   # restore authorized dirs so localized music plays after a restart


def _is_within(child: str, parent: str) -> bool:
    try:
        return os.path.commonpath([child, parent]) == parent
    except ValueError:
        # Different drives on Windows raise ValueError -> definitely not within.
        return False


def handle_port_get_request(handler, path: str, query, send_json_fn) -> bool:
    if path == "/api/audioflix/port/list":
        dir_path = query.get("path", [""])[0]
        if not dir_path:
            send_json_fn(handler, {"ok": False, "message": "Missing path parameter."}, HTTPStatus.BAD_REQUEST)
            return True

        if not os.path.exists(dir_path) or not os.path.isdir(dir_path):
            send_json_fn(handler, {"ok": False, "message": "Directory does not exist or is not a folder."}, HTTPStatus.NOT_FOUND)
            return True

        try:
            canon_dir = _canon(dir_path)
            authorize_dir(canon_dir)  # registering a port authorizes serving its files (persisted)
            files = []
            for dirpath, _dirnames, filenames in os.walk(canon_dir):
                canon_sub = _canon(dirpath)
                if canon_sub != canon_dir:
                    authorize_dir(canon_sub)  # authorize subdirectories too (persisted)
                for filename in filenames:
                    filepath = os.path.join(dirpath, filename)
                    _, ext = os.path.splitext(filename.lower())
                    if ext in AUDIO_EXTENSIONS:
                        files.append({"name": filename, "path": filepath})
            send_json_fn(handler, {"ok": True, "files": files})
        except Exception as e:
            send_json_fn(handler, {"ok": False, "message": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
        return True

    elif path == "/api/audioflix/port/file":
        file_path = query.get("path", [""])[0]
        if not file_path:
            handler.send_error(HTTPStatus.BAD_REQUEST, "Missing path parameter.")
            return True

        real = _canon(file_path)
        _, ext = os.path.splitext(real.lower())
        if ext not in AUDIO_EXTENSIONS:
            handler.send_error(HTTPStatus.FORBIDDEN, "Only audio files can be served.")
            return True
        # Only serve from directories the user actually registered (a port listing, a localize run,
        # or a folder scan). Do NOT auto-authorize an unknown parent just because the file exists:
        # that would turn this endpoint into an arbitrary audio-file reader for anything that can
        # reach 127.0.0.1. Restart-survival is handled by persisting the registry, not by trusting
        # whatever path was asked for.
        if not any(_is_within(real, d) for d in _ALLOWED_DIRS):
            handler.send_error(HTTPStatus.FORBIDDEN, "File is not inside a registered port directory.")
            return True
        if not os.path.isfile(real):
            # Fallback: the stored localPath may point to the wrong subdirectory level.
            # Search registered allowed dirs for a file with the same basename.
            target_name = os.path.basename(real).lower()
            found = None
            for allowed in list(_ALLOWED_DIRS):
                try:
                    for dirpath, _dns, fns in os.walk(allowed):
                        for fn in fns:
                            if fn.lower() == target_name:
                                candidate = os.path.join(dirpath, fn)
                                if os.path.isfile(candidate):
                                    found = _canon(candidate)
                                    break
                        if found:
                            break
                except OSError:
                    continue
                if found:
                    break
            if not found:
                handler.send_error(HTTPStatus.NOT_FOUND, "File not found.")
                return True
            real = found

        try:
            _serve_file_ranged(handler, real, _CONTENT_TYPES.get(ext, "application/octet-stream"))
        except Exception as e:
            handler.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(e))
        return True

    return False
