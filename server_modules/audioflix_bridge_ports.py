import os
from http import HTTPStatus

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
            files = []
            audio_extensions = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"}
            for filename in os.listdir(dir_path):
                filepath = os.path.join(dir_path, filename)
                if os.path.isfile(filepath):
                    _, ext = os.path.splitext(filename.lower())
                    if ext in audio_extensions:
                        files.append({
                            "name": filename,
                            "path": filepath
                        })
            send_json_fn(handler, {"ok": True, "files": files})
        except Exception as e:
            send_json_fn(handler, {"ok": False, "message": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
        return True
            
    elif path == "/api/audioflix/port/file":
        file_path = query.get("path", [""])[0]
        if not file_path:
            handler.send_error(HTTPStatus.BAD_REQUEST, "Missing path parameter.")
            return True
            
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            handler.send_error(HTTPStatus.NOT_FOUND, "File not found.")
            return True
            
        try:
            _, ext = os.path.splitext(file_path.lower())
            content_type = {
                ".mp3": "audio/mpeg",
                ".wav": "audio/wav",
                ".ogg": "audio/ogg",
                ".m4a": "audio/mp4",
                ".aac": "audio/aac",
                ".flac": "audio/flac"
            }.get(ext, "application/octet-stream")
            
            with open(file_path, "rb") as f:
                content = f.read()
                
            handler.send_response(HTTPStatus.OK)
            handler.send_header("Content-Type", content_type)
            handler.send_header("Content-Length", str(len(content)))
            handler.end_headers()
            handler.wfile.write(content)
        except Exception as e:
            handler.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(e))
        return True
        
    return False
