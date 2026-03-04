#!/usr/bin/env python3
"""
Fandom Discovery Toolkit Server
A simple HTTP server with CORS support and error handling

This server enables local development and testing of the Fandom Discovery Toolkit.
"""

import http.server
import socketserver
import os
import sys
import argparse
import logging
import socket
import webbrowser
from urllib.parse import urlparse, parse_qs
from http import HTTPStatus

# Import modular handlers
# Ensure the directory is in path if needed (implicit for same dir)
try:
    from server_modules import wikipedia
    from server_modules import proxy
    from server_modules import eve_state_store
except ImportError as e:
    print(f"Error importing modules: {e}")
    # Fallback or exit? For now, let's assume it works.
    pass

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="[Server] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("FandomDiscoveryServer")

# Default port
DEFAULT_PORT = 3000


def configure_modular_store(modular_root=None, persist_modular_root=False):
    """
    Apply an optional per-process modular store override.
    This enables multiple server instances (different ports) to run against
    different data-pack folders at the same time.
    """
    if not modular_root:
        return

    if "eve_state_store" not in globals():
        print("[WARN] eve_state_store module unavailable; modular root override skipped.")
        return

    try:
        resolved = eve_state_store.set_active_store_root(
            modular_root,
            create_if_missing=True,
            persist=bool(persist_modular_root)
        )
        print(f"[OK] Modular store root: {resolved}")
    except Exception as exc:
        print(f"[ERROR] Failed to apply modular store path '{modular_root}': {exc}")
        sys.exit(1)

class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP request handler with CORS support"""
    
    def __init__(self, *args, **kwargs):
        # Set default directory to current directory
        directory = os.getcwd()
        super().__init__(*args, directory=directory, **kwargs)
    
    def end_headers(self):
        # Add CORS headers to all responses
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
        self.send_header("Access-Control-Max-Age", "86400")  # 24 hours
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()
    
    def do_OPTIONS(self):
        """Handle OPTIONS request method for CORS preflight requests"""
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests with custom error handling"""
        try:
            # Check for API endpoints
            if self.path.startswith('/api/'):
                self.handle_api_request()
                return
                
            # Handle normal file requests
            super().do_GET()
        except Exception as e:
            logger.error(f"Error handling GET request: {str(e)}")
            # If headers haven't been sent, send error
            try:
                self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Server error: {str(e)}")
            except:
                pass # Headers likely already sent

    def do_POST(self):
        """Handle POST requests for API endpoints"""
        try:
            if self.path.startswith('/api/'):
                self.handle_api_post_request()
                return
            self.send_error(HTTPStatus.METHOD_NOT_ALLOWED, "POST not supported for this endpoint")
        except Exception as e:
            logger.error(f"Error handling POST request: {str(e)}")
            try:
                self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Server error: {str(e)}")
            except:
                pass
    
    def log_message(self, format, *args):
        """Override log_message to use our logger"""
        logger.info(format % args)
    
    def handle_api_request(self):
        """Handle custom API endpoints"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        query = parse_qs(parsed_path.query)
        
        if path == '/api/status':
            # Return server status
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "ok", "version": "1.0.0"}')
        
        elif path == '/api/wikipedia/search':
            # Handle Wikipedia search request
            wikipedia.handle_wikipedia_search(self, query)
            
        elif path == '/api/proxy':
            # Handle proxy request
            proxy.handle_proxy_request(self, query)

        elif path.startswith('/api/eve-state/modular/'):
            if not eve_state_store.handle_get_request(self, path, query):
                self.send_response(HTTPStatus.NOT_FOUND)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"error": "Unknown modular state endpoint"}')
            
        else:
            # Unknown API endpoint
            self.send_response(HTTPStatus.NOT_FOUND)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error": "Unknown API endpoint"}')

    def handle_api_post_request(self):
        """Handle API POST endpoints"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        if path.startswith('/api/eve-state/modular/'):
            if eve_state_store.handle_post_request(self, path):
                return
            self.send_response(HTTPStatus.NOT_FOUND)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error": "Unknown modular state endpoint"}')
            return

        self.send_response(HTTPStatus.NOT_FOUND)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"error": "Unknown API endpoint"}')

def get_local_ip():
    """Get local IP address for displaying server URLs"""
    try:
        # This doesn't actually establish a connection
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"

def run_server(port=DEFAULT_PORT, open_browser=True):
    """Run the HTTP server"""
    try:
        # Create server with threading support
        handler = CORSHTTPRequestHandler
        with socketserver.ThreadingTCPServer(("", port), handler) as httpd:
            local_ip = get_local_ip()
            url = f"http://localhost:{port}/EveOS.html"
            active_store = ""
            if "eve_state_store" in globals():
                try:
                    active_store = str(eve_state_store.get_active_store_root())
                except Exception:
                    active_store = ""
            
            # Print server information
            print("[OK] Fandom Discovery Toolkit Server")
            print("  ------------------------------")
            print(f"  Local:   {url}")
            print(f"  Network: http://{local_ip}:{port}/EveOS.html")
            if active_store:
                print(f"  Data:    {active_store}")
            print("  ------------------------------")
            print("  Proxy:   Enabled at /api/proxy?url=...")
            print("  ------------------------------")
            print("  Press Ctrl+C to stop the server")
            
            # Open browser
            if open_browser:
                print("  Opening browser...")
                webbrowser.open(url)
            
            # Start server
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[OK] Server stopped")
    except Exception as e:
        print(f"[ERROR] Server error: {str(e)}")
        # If port is in use, suggest another port
        if isinstance(e, OSError) and e.errno == 98:  # Address already in use
            suggested_port = port + 1
            print(f"[WARN] Port {port} is already in use. Try using port {suggested_port}:")
            print(f"   python python-server.py {suggested_port}")
        return 1
    return 0

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Fandom Discovery Toolkit Server (EveOS backend)"
    )
    parser.add_argument(
        "port",
        nargs="?",
        type=int,
        default=DEFAULT_PORT,
        help=f"HTTP port to bind (default: {DEFAULT_PORT})"
    )
    parser.add_argument(
        "--modular-root",
        dest="modular_root",
        default="",
        help="Override modular state root folder for this server instance."
    )
    parser.add_argument(
        "--persist-modular-root",
        dest="persist_modular_root",
        action="store_true",
        help="Persist --modular-root into shared modular-store settings."
    )
    parser.add_argument(
        "--no-browser",
        dest="no_browser",
        action="store_true",
        help="Start server without auto-opening a browser tab."
    )

    args = parser.parse_args()
    configure_modular_store(args.modular_root, args.persist_modular_root)
    sys.exit(run_server(args.port, open_browser=not args.no_browser))
