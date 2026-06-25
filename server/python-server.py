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

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SERVER_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import modular handlers
# Ensure the directory is in path if needed (implicit for same dir)
try:
    from server_modules import wikipedia
    from server_modules import proxy
    from server_modules import lightpanda
    from server_modules import popup_viewer
    from server_modules import eve_state_store
    from server_modules import gemini_control
    from server_modules import gemini_credentials
    from server_modules import audioflix_bridge
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

def eveos_cors_origin(origin):
    """Reflect the request Origin only if it's a trusted local context, else None (omit ACAO).
    Blocks a random website you visit from reading these local endpoints' responses, while
    keeping file://, localhost, 127.0.0.1, and same-origin/non-browser requests working."""
    o = (origin or "").strip()
    if not o:
        return "*"            # no Origin = same-origin or non-browser tool; no cross-origin risk
    lo = o.lower()
    if lo == "null" or lo.startswith("file://"):
        return o
    for host in ("http://localhost", "http://127.0.0.1", "https://localhost", "https://127.0.0.1"):
        if lo == host or lo.startswith(host + ":"):
            return o
    return None              # untrusted cross-origin -> omit header, browser blocks the read


class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP request handler with CORS support"""
    
    def __init__(self, *args, **kwargs):
        # Serve EveOS assets from the project root even though this entrypoint
        # lives under server/ to keep the repo root clean.
        directory = PROJECT_ROOT
        super().__init__(*args, directory=directory, **kwargs)
    
    def end_headers(self):
        # Add CORS headers to all responses (Origin allow-listed; see eveos_cors_origin).
        _acao = eveos_cors_origin(self.headers.get("Origin"))
        if _acao is not None:
            self.send_header("Access-Control-Allow-Origin", _acao)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
        self.send_header("Access-Control-Max-Age", "86400")  # 24 hours
        self._send_cache_control()
        super().end_headers()

    def _send_cache_control(self):
        """Pick a cache policy so localhost loads fast without serving stale code.

        - API responses are always dynamic -> never cache.
        - Versioned static assets (URL carries `?v=`) are safe to cache hard: the version IS the
          cache-buster, so bumping it changes the URL and forces a fresh fetch. This is what makes
          repeat loads fast — the hundreds of `?v=` JS/CSS files come straight from the browser
          cache instead of being re-downloaded every time (the old `no-store` defeated the app's
          own `?v=` design).
        - Everything else (EveOS.html, the manifest, any unversioned file) is cached but always
          revalidated (304 when unchanged) so edits and manifest version bumps show up immediately.
        """
        path = self.path or ""
        if path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        elif "?v=" in path or "&v=" in path:
            self.send_header("Cache-Control", "public, max-age=86400")
        else:
            self.send_header("Cache-Control", "no-cache")
    
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

        elif path == '/api/lightpanda':
            # Handle Lightpanda fetch request
            lightpanda.handle_lightpanda_fetch(self, query)

        elif path == '/api/popup-view' or path.startswith('/api/popup-view/'):
            popup_viewer.handle_popup_view(self, query)

        elif path == '/api/popup-resource' or path.startswith('/api/popup-resource/'):
            popup_viewer.handle_popup_resource_request(self, query)

        elif path.startswith('/api/eve-state/modular/'):
            if not eve_state_store.handle_get_request(self, path, query):
                self.send_response(HTTPStatus.NOT_FOUND)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"error": "Unknown modular state endpoint"}')

        elif path == '/api/gemini-server/status':
            gemini_control.send_json(self, gemini_control.get_status())

        elif path == '/api/gemini-credentials/status':
            if not gemini_control.request_can_control(self):
                gemini_control.send_json(
                    self,
                    {"ok": False, "configured": False, "message": "Local access required."},
                    HTTPStatus.FORBIDDEN
                )
                return
            gemini_control.send_json(self, gemini_credentials.get_status())

        elif path.startswith('/api/audioflix/'):
            if audioflix_bridge.handle_get_request(self, path, query):
                return
            self.send_response(HTTPStatus.NOT_FOUND)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error": "Unknown Audioflix endpoint"}')
            
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
        query = parse_qs(parsed_path.query)

        if path == '/api/proxy':
            proxy.handle_proxy_post_request(self, query)
            return

        if path == '/api/popup-resource' or path.startswith('/api/popup-resource/'):
            popup_viewer.handle_popup_resource_request(self, query)
            return

        if path.startswith('/api/eve-state/modular/'):
            if eve_state_store.handle_post_request(self, path):
                return
            self.send_response(HTTPStatus.NOT_FOUND)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error": "Unknown modular state endpoint"}')
            return

        if path in {'/api/gemini-server/start', '/api/gemini-server/stop'}:
            if not gemini_control.request_can_control(self):
                gemini_control.send_json(
                    self,
                    {
                        "ok": False,
                        "controllerAvailable": True,
                        "state": "forbidden",
                        "running": False,
                        "message": "Gemini server control is limited to local EveOS pages."
                    },
                    HTTPStatus.FORBIDDEN
                )
                return
            action = gemini_control.start_server if path.endswith('/start') else gemini_control.stop_server
            payload = action()
            gemini_control.send_json(self, payload, HTTPStatus.OK if payload.get("ok") else HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if path == '/api/gemini-credentials':
            if not gemini_control.request_can_control(self):
                gemini_control.send_json(
                    self,
                    {"ok": False, "configured": False, "message": "Local access required."},
                    HTTPStatus.FORBIDDEN
                )
                return
            body = gemini_credentials.read_json_body(self)
            payload = gemini_credentials.save_api_key(body.get("apiKey", ""))
            gemini_control.send_json(
                self,
                payload,
                HTTPStatus.OK if payload.get("ok") else HTTPStatus.BAD_REQUEST
            )
            return

        if path.startswith('/api/audioflix/'):
            if audioflix_bridge.handle_post_request(self, path):
                return
            self.send_response(HTTPStatus.NOT_FOUND)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error": "Unknown Audioflix endpoint"}')
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
        socketserver.ThreadingTCPServer.allow_reuse_address = True
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
            print("  Popup:   Enabled at /api/popup-view?url=...")
            print("  Bridge:  Lightpanda/WSL enabled at /api/lightpanda")
            print("  Gemini:  Lifecycle control enabled at /api/gemini-server/status")
            print("  Audio:   Soundboard + VB-Cable bypass + global hotkeys at /api/audioflix/*")
            # Pre-warm the audio device scan so the first soundboard press / hotkey right after
            # boot isn't delayed by a cold WASAPI device enumeration. Non-fatal, off-thread.
            if "audioflix_bridge" in globals():
                try:
                    import threading as _af_t
                    _af_t.Thread(target=lambda: audioflix_bridge.list_devices(force=True), daemon=True).start()
                except Exception:
                    pass
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
            print(f"   python server/python-server.py {suggested_port}")
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

    args, unknown = parser.parse_known_args()
    if unknown:
        # Be tolerant if a modular-root path with spaces was passed without
        # proper quoting (common when launched from batch scripts).
        if args.modular_root and all(not str(token).startswith("-") for token in unknown):
            args.modular_root = " ".join([args.modular_root] + [str(token) for token in unknown]).strip()
        else:
            parser.error(f"unrecognized arguments: {' '.join(str(token) for token in unknown)}")
    if not args.modular_root:
        env_modular_root = os.environ.get("EVEOS_MODULAR_ROOT", "").strip()
        if env_modular_root:
            args.modular_root = env_modular_root

    configure_modular_store(args.modular_root, args.persist_modular_root)
    sys.exit(run_server(args.port, open_browser=not args.no_browser))
