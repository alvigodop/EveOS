import http.server
import json
import socket
import socketserver

from ..server_initialization.server_config import DEFAULT_PORT


def _websocket_ready():
    try:
        with socket.create_connection(("127.0.0.1", DEFAULT_PORT), timeout=0.2):
            return True
    except OSError:
        return False

class StatusHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def do_GET(self):
        if self.path != '/status':
            self.send_error(404, "Unknown status endpoint")
            return

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

        body = json.dumps(status_data).encode("utf-8")
        self.send_response(200)
        self.send_header('Content-type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Connection', 'close')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass
        self.close_connection = True

    def log_message(self, format, *args):
        # Suppress log messages
        pass


class ThreadingStatusServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def start_status_server(port):
    """
    Start the status HTTP server on the specified port.

    Args:
        port (int): The port number to run the status server on

    Returns:
        http.server.HTTPServer: The running server instance
    """
    server = ThreadingStatusServer(('127.0.0.1', port), StatusHandler)
    print(f"Status HTTP server started on port {port}")
    return server
