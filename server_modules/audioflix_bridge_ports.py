import os
from http import HTTPStatus

AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"}

# Directories the user has explicitly registered as soundboard "ports". The file
# endpoint will only serve files that live inside one of these (and only audio
# files), so a crafted ?path= cannot read arbitrary files off the machine. A dir
# is registered the first time the client lists it (loadPortedSounds on open).
_ALLOWED_DIRS: set[str] = set()

_CONTENT_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
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
            _ALLOWED_DIRS.add(canon_dir)  # registering a port authorizes serving its files
            files = []
            for filename in os.listdir(canon_dir):
                filepath = os.path.join(canon_dir, filename)
                if os.path.isfile(filepath):
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
        if not any(_is_within(real, d) for d in _ALLOWED_DIRS):
            if os.path.isfile(real):
                _ALLOWED_DIRS.add(_canon(os.path.dirname(real)))
            else:
                handler.send_error(HTTPStatus.FORBIDDEN, "File is not inside a registered port directory.")
                return True
        if not os.path.isfile(real):
            handler.send_error(HTTPStatus.NOT_FOUND, "File not found.")
            return True

        try:
            _serve_file_ranged(handler, real, _CONTENT_TYPES.get(ext, "application/octet-stream"))
        except Exception as e:
            handler.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(e))
        return True

    return False
