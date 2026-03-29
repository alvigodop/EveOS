import subprocess
import logging
import json
from http import HTTPStatus
import os
import re
import shlex
from types import SimpleNamespace

logger = logging.getLogger("FandomDiscoveryServer")

DEFAULT_WSL_DISTRO = "Ubuntu"

def _project_root():
    return (
        os.environ.get("EVEOS_PROJECT_ROOT")
        or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )

def _lightpanda_binary_path():
    explicit = (os.environ.get("EVEOS_LIGHTPANDA_BIN") or "").strip()
    if explicit:
        return explicit
    return os.path.join(_project_root(), "bin", "lightpanda")

def _wsl_distro():
    return (os.environ.get("EVEOS_LIGHTPANDA_WSL_DISTRO") or DEFAULT_WSL_DISTRO).strip() or DEFAULT_WSL_DISTRO

def _windows_to_wsl_path(path):
    normalized = os.path.abspath(path).replace("\\", "/")
    match = re.match(r"^([A-Za-z]):/(.*)$", normalized)
    if not match:
        return normalized
    drive = match.group(1).lower()
    remainder = match.group(2)
    return f"/mnt/{drive}/{remainder}"

def _build_lightpanda_command(target_url):
    binary_path = _lightpanda_binary_path()
    binary_wsl_path = _windows_to_wsl_path(binary_path) if ":" in binary_path[:3] else binary_path
    target_url = str(target_url or "").strip()
    return [
        "wsl",
        "-d",
        _wsl_distro(),
        "bash",
        "-lc",
        f"{shlex.quote(binary_wsl_path)} fetch --dump html --obey_robots --log_level error {shlex.quote(target_url)}",
    ]

def is_lightpanda_available():
    return os.path.exists(_lightpanda_binary_path())

def _decode_lightpanda_stream(raw_bytes):
    if raw_bytes is None:
        return ""
    if isinstance(raw_bytes, str):
        return raw_bytes
    for encoding in ("utf-8", "utf-8-sig"):
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("utf-8", errors="replace")

def fetch_lightpanda_html(target_url, timeout=30):
    if not is_lightpanda_available():
        raise FileNotFoundError(f"Lightpanda binary not found at {_lightpanda_binary_path()}")
    cmd = _build_lightpanda_command(target_url)
    result = subprocess.run(cmd, capture_output=True, text=False, timeout=timeout)
    return SimpleNamespace(
        returncode=result.returncode,
        stdout=_decode_lightpanda_stream(result.stdout),
        stderr=_decode_lightpanda_stream(result.stderr),
    )

def handle_lightpanda_fetch(handler, query):
    """Handle requests to /api/lightpanda?url=..."""
    target_url_list = query.get('url')
    
    if not target_url_list:
        handler.send_response(HTTPStatus.BAD_REQUEST)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        handler.wfile.write(b'{"error": "Missing url parameter"}')
        return

    # Check if Lightpanda is manually disabled via environment variable
    if os.environ.get("EVEOS_LIGHTPANDA_DISABLED") == "1":
        logger.info("Lightpanda: Fetch requested but bridge is currently DISABLED via toggle.")
        handler.send_response(HTTPStatus.SERVICE_UNAVAILABLE)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        handler.wfile.write(b'{"error": "Lightpanda bridge is disabled"}')
        return

    # Path for activity monitoring
    log_path = os.path.join(_project_root(), "bin", "lightpanda_activity.log")
    
    def log_activity(msg):
        try:
            from datetime import datetime
            timestamp = datetime.now().strftime("%H:%M:%S")
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(f"[{timestamp}] {msg}\n")
        except:
            pass

    target_url = target_url_list[0]
    logger.info(f"Lightpanda: Fetching URL: {target_url}")
    log_activity(f"FETCH START: {target_url}")
    
    try:
        result = fetch_lightpanda_html(target_url, timeout=30)
        
        if result.returncode == 0:
            content = result.stdout or ""
            logger.info(f"Lightpanda: Successfully fetched {len(content)} bytes from {target_url}")
            log_activity(f"SUCCESS: {target_url} ({len(content)} bytes)")
            
            handler.send_response(HTTPStatus.OK)
            handler.send_header('Content-Type', 'text/html')
            handler.end_headers()
            handler.wfile.write(content.encode('utf-8'))
        else:
            logger.warning(f"Lightpanda: Execution failed with return code {result.returncode}")
            log_activity(f"FAILED: {target_url} (Code: {result.returncode})")
            if result.stderr:
                log_activity(f"  ERR: {result.stderr.strip()[:100]}")
            
            handler.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
            handler.send_header('Content-Type', 'application/json')
            handler.end_headers()
            error_msg = json.dumps({
                "error": "Lightpanda execution failed",
                "details": result.stderr
            })
            handler.wfile.write(error_msg.encode('utf-8'))
            
    except subprocess.TimeoutExpired:
        logger.warning(f"Lightpanda: Timeout fetching {target_url}")
        log_activity(f"TIMEOUT: {target_url}")
        handler.send_response(HTTPStatus.GATEWAY_TIMEOUT)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        handler.wfile.write(b'{"error": "Lightpanda fetch timed out"}')
        
    except Exception as e:
        logger.error(f"Lightpanda: Unexpected error: {str(e)}")
        handler.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        error_msg = json.dumps({
            "error": "Internal Server Error",
            "details": str(e)
        })
        handler.wfile.write(error_msg.encode('utf-8'))
