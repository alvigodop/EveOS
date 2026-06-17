import http.server
import json
import socket

from ..server_initialization.server_config import DEFAULT_PORT


def _websocket_ready():
    try:
        with socket.create_connection(("127.0.0.1", DEFAULT_PORT), timeout=0.2):
            return True
    except OSError:
        return False

class StatusHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        # Import here to avoid circular imports
        from ..session_management.session_manager import get_active_sessions, MAIN_MODEL_SESSION_LIMIT
        websocket_ready = _websocket_ready()

        # Send status information as JSON
        status_data = {
            "status": "running" if websocket_ready else "starting",
            "running": websocket_ready,
            "websocketReady": websocket_ready,
            "websocketPort": DEFAULT_PORT,
            "active_sessions": len(get_active_sessions()),
            "max_connections": MAIN_MODEL_SESSION_LIMIT,
            "message": "WebSocket server is running" if websocket_ready else "WebSocket server is starting"
        }

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(status_data).encode())

    def log_message(self, format, *args):
        # Suppress log messages
        pass

def start_status_server(port):
    """
    Start the status HTTP server on the specified port.

    Args:
        port (int): The port number to run the status server on

    Returns:
        http.server.HTTPServer: The running server instance
    """
    server = http.server.HTTPServer(('localhost', port), StatusHandler)
    print(f"Status HTTP server started on port {port}")
    return server
