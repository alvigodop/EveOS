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
            handler.send_error(HTTPStatus.FORBIDDEN, "File is not inside a registered port directory.")
            return True
        if not os.path.isfile(real):
            handler.send_error(HTTPStatus.NOT_FOUND, "File not found.")
            return True

        try:
            with open(real, "rb") as f:
                content = f.read()
            handler.send_response(HTTPStatus.OK)
            handler.send_header("Content-Type", _CONTENT_TYPES.get(ext, "application/octet-stream"))
            handler.send_header("Content-Length", str(len(content)))
            handler.end_headers()
            handler.wfile.write(content)
        except Exception as e:
            handler.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(e))
        return True

    return False
