from http.server import BaseHTTPRequestHandler
import os
from urllib.parse import urlparse
import subprocess
import json
import mimetypes
from html import escape
from pathlib import Path
from urllib.parse import quote, unquote

from http_server_runtime import STATIC_DIR

class CORSRequestHandler(BaseHTTPRequestHandler):
    CONTROL_CHOICES = {
        "start": "1",
        "1": "1",
        "stop": "2",
        "2": "2",
        "restart": "3",
        "3": "3",
    }

    def send_cors_headers(self):
        _o = (self.headers.get("Origin") or "").strip(); _lo = _o.lower()
        if (not _o) or _lo == "null" or _lo.startswith("file://") or any(_lo == _h or _lo.startswith(_h + ":") for _h in ("http://localhost", "http://127.0.0.1", "https://localhost", "https://127.0.0.1")):
            self.send_header("Access-Control-Allow-Origin", _o or "*")
        self.send_header("Vary", "Origin")
        self.send_header('Access-Control-Allow-Methods', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        # Disable caching to ensure fresh content on each request
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')

    def get_clean_path(self, path):
        """Remove query parameters and clean the path"""
        # Parse URL and get clean path without query parameters
        parsed = urlparse(path)
        clean_path = unquote(parsed.path).lstrip('/')
        
        return clean_path

    def resolve_static_path(self, path):
        """Resolve a request below STATIC_DIR and reject parent traversal."""
        static_root = Path(STATIC_DIR).resolve()
        candidate = (static_root / self.get_clean_path(path)).resolve()
        try:
            candidate.relative_to(static_root)
        except ValueError as exc:
            raise PermissionError("Requested path escapes the static root") from exc
        return candidate

    def do_HEAD(self):
        try:
            print(f"\nReceived HEAD request:")
            print(f"Path: {self.path}")
            
            # Special handling for status check
            if self.path == '/status':
                self.send_response(200)
                self.send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                return
                
            # Get clean path without query parameters
            file_path = self.get_clean_path(self.path)
            
            abs_path = self.resolve_static_path(self.path)
            print(f"Checking existence of: {abs_path}")
            
            if os.path.exists(abs_path):
                self.send_response(200)
                self.send_cors_headers()
                # Determine and send correct content type
                content_type, encoding = mimetypes.guess_type(abs_path)
                if content_type is None:
                    content_type = 'application/octet-stream'
                self.send_header('Content-Type', content_type)
                if encoding:
                    self.send_header('Content-Encoding', encoding)
                self.end_headers()
                print(f"File exists: {file_path}")
            else:
                print(f"File not found: {abs_path}")
                self.send_error(404, f"File not found: {file_path}")
                
        except PermissionError as e:
            print(f"Blocked static path: {e}")
            self.send_error(403, "Forbidden path")
        except Exception as e:
            print(f"Error handling HEAD request: {str(e)}")
            self.send_error(500, str(e))

    def do_GET(self):
        try:
            print(f"\nReceived GET request:")
            print(f"Path: {self.path}")
            print(f"Headers: {self.headers}")
            
            # Handle status check endpoint
            if self.path == '/status':
                self.send_response(200)
                self.send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "running",
                    "message": "HTTP Server is running"
                }).encode())
                return
            
            # Get clean path without query parameters
            file_path = self.get_clean_path(self.path)
            
            # Default to gemini_chat_interface.html if root is requested
            if not file_path or file_path == '/' or file_path == '.':
                file_path = 'gemini_chat_interface.html'
            
            abs_path = self.resolve_static_path(file_path)
            print(f"Attempting to serve: {abs_path}")
            
            if not os.path.exists(abs_path):
                print(f"File not found: {abs_path}")
                self.send_error(404, f"File not found: {file_path}")
                return
            
            # If requesting a directory, render a simple directory listing
            if os.path.isdir(abs_path):
                entries = os.listdir(abs_path)
                self.send_response(200)
                self.send_cors_headers()
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                # Write HTML directory listing
                self.wfile.write(f"<html><head><title>Directory listing for {self.path}</title></head><body><h2>Directory listing for {self.path}</h2><ul>".encode())
                for name in entries:
                    href = self.path.rstrip('/') + '/' + quote(name)
                    self.wfile.write(f'<li><a href="{escape(href, quote=True)}">{escape(name)}</a></li>'.encode())
                self.wfile.write(b"</ul></body></html>")
                print(f"Served directory listing for {abs_path}")
                return
            
            # Serve the file
            try:
                with open(abs_path, 'rb') as f:
                    content = f.read()
                
                self.send_response(200)
                self.send_cors_headers()
                
                # Set correct content type based on file extension
                content_type, encoding = mimetypes.guess_type(abs_path)
                if content_type is None:
                    content_type = 'application/octet-stream'
                self.send_header('Content-Type', content_type)
                if encoding:
                    self.send_header('Content-Encoding', encoding)
                
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                print(f"Successfully served {file_path}")
                
            except Exception as e:
                print(f"Error serving file: {str(e)}")
                self.send_error(500, str(e))
                
        except PermissionError as e:
            print(f"Blocked static path: {e}")
            self.send_error(403, "Forbidden path")
        except Exception as e:
            print(f"Error handling request: {str(e)}")
            self.send_error(500, str(e))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_POST(self):
        try:
            if self.path.startswith('/server-control/'):
                command = unquote(urlparse(self.path).path.rsplit('/', 1)[-1]).strip().lower()
                print(f"\nReceived request to control server: {command}")
                
                try:
                    project_root = Path(__file__).resolve().parents[3]
                    server_control = project_root / 'tools' / 'batch' / 'server-menu.bat'
                    choice = self.CONTROL_CHOICES.get(command)
                    if not choice:
                        self.send_response(400)
                        self.send_cors_headers()
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            "status": "error",
                            "message": "Expected start, stop, or restart.",
                            "command": command
                        }).encode())
                        return

                    if not server_control.is_file():
                        raise Exception(f"Canonical Gemini menu not found: {server_control}")
                    
                    print(f"Executing canonical choice {choice} using {server_control}")
                    
                    result = subprocess.run(
                        ["cmd", "/d", "/c", str(server_control), choice],
                        cwd=str(project_root),
                        capture_output=True,
                        text=True,
                        shell=False,
                        timeout=45,
                        creationflags=subprocess.CREATE_NO_WINDOW
                    )
                    print(f"Command output: {result.stdout}")
                    if result.stderr:
                        print(f"Command error: {result.stderr}")
                    success = result.returncode == 0
                    message = result.stdout.strip() if success else (result.stderr.strip() or result.stdout.strip())

                    # Send response
                    self.send_response(200)
                    self.send_cors_headers()
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "success" if success else "error",
                        "message": message,
                        "command": command
                    }).encode())
                    return
                    
                except Exception as e:
                    print(f"Error executing command: {str(e)}")
                    self.send_response(500)
                    self.send_cors_headers()
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "error",
                        "message": str(e),
                        "command": command
                    }).encode())
                    return
            
            self.send_error(404, "Not found")
        except Exception as e:
            print(f"Error handling POST request: {str(e)}")
            self.send_error(500, str(e))
