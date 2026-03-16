import subprocess
import logging
import json
from http import HTTPStatus
import os

logger = logging.getLogger("FandomDiscoveryServer")

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
    log_path = os.path.join(os.getcwd(), "bin", "lightpanda_activity.log")
    
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
        # Construct the WSL command to run lightpanda fetch
        # Execute from the project's own bin folder via /mnt/c mount
        project_root = "/mnt/c/Users/alvin/Documents/Workspace/RoughProjDeving/EveOS-0.4"
        cmd = [
            "wsl", "-d", "Ubuntu", "bash", "-c", 
            f"{project_root}/bin/lightpanda fetch --dump html --obey_robots --log_level error {target_url}"
        ]
        
        # Execute the command
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            content = result.stdout
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
