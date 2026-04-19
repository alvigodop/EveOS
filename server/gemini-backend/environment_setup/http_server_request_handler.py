from http.server import HTTPServer, BaseHTTPRequestHandler
import os
import sys
import socket
import signal
from urllib.parse import urlparse
import time
import argparse
import subprocess
import json
import mimetypes
import ssl

from http_server_runtime import STATIC_DIR

class CORSRequestHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
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
        clean_path = parsed.path.lstrip('/')
        
        return clean_path

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
            
            # Use explicit static directory
            static_dir = STATIC_DIR
            abs_path = os.path.join(static_dir, file_path)
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
            
            # Use explicit static directory
            static_dir = STATIC_DIR
            abs_path = os.path.join(static_dir, file_path)
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
                    href = os.path.join(self.path.rstrip('/'), name)
                    self.wfile.write(f'<li><a href="{href}">{name}</a></li>'.encode())
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
                command = self.path.split('/')[-1]
                print(f"\nReceived request to control server: {command}")
                
                try:
                    # Get the script directory and root directory
                    script_dir = os.path.dirname(os.path.abspath(__file__))
                    root_dir = os.path.abspath(os.path.join(script_dir, '..', '..'))
                    server_control = os.path.join(root_dir, 'server_control.bat')
                    
                    if not os.path.exists(server_control):
                        raise Exception(f"server_control.bat not found in {root_dir}")
                    
                    print(f"Executing command {command} using {server_control}")
                    
                    # Execute the command using server_control.bat with visible window
                    if command == "5":  # Special handling for stopping main server
                        print("Stopping Main Server...")
                        try:
                            # First try to find the specific process by port
                            netstat = subprocess.run(['netstat', '-ano'], capture_output=True, text=True)
                            main_server_pid = None
                            for line in netstat.stdout.splitlines():
                                if ':9083' in line and 'LISTENING' in line:
                                    main_server_pid = line.split()[-1]
                                    break
                            
                            if main_server_pid:
                                # Kill only this specific process
                                subprocess.run(['taskkill', '/F', '/PID', main_server_pid],
                                            creationflags=subprocess.CREATE_NO_WINDOW)
                            else:
                                # Fallback to window title, but without /T flag
                                subprocess.run(['taskkill', '/F', '/FI', 'WINDOWTITLE eq Main Server'],
                                            creationflags=subprocess.CREATE_NO_WINDOW)
                            
                            time.sleep(2)  # Wait for process to be killed
                            
                            # Verify the port is free
                            netstat = subprocess.run(['netstat', '-ano'], capture_output=True, text=True)
                            port_in_use = ':9083' in netstat.stdout
                            
                            success = not port_in_use
                            message = "Main server stopped successfully" if success else "Warning: Port 9083 may still be in use"
                            
                        except Exception as e:
                            print(f"Error stopping main server: {e}")
                            success = False
                            message = f"Error stopping main server: {str(e)}"
                    elif command == "2":  # Special handling for main server
                        # Start main server directly in a new visible console window
                        interactions_dir = os.path.abspath(os.path.join(script_dir, '..', 'interactions'))
                        script_path = os.path.join(interactions_dir, 'main.py')
                        if not os.path.exists(script_path):
                            raise Exception(f"main.py not found in {interactions_dir}")
                            
                        # Kill any existing process on port 9083
                        subprocess.run(['taskkill', '/F', '/FI', 'WINDOWTITLE eq Main Server*'], 
                                    creationflags=subprocess.CREATE_NO_WINDOW)
                        time.sleep(1)
                        
                        # Start the main server in the same style as HTTP server
                        process = subprocess.Popen(
                            f'start "Main Server" /min cmd /c "cd /d "{script_dir}" && python "{script_path}" --port 9083"',
                            shell=True
                        )
                        
                        time.sleep(2)  # Wait for server to start
                            
                        success = True
                        message = "Main server starting in new window"
                    else:
                        # Other commands run normally
                        result = subprocess.run([server_control, command], 
                                             cwd=root_dir,
                                             capture_output=True,
                                             text=True,
                                             shell=True,
                                             creationflags=subprocess.CREATE_NO_WINDOW)
                        
                        print(f"Command output: {result.stdout}")
                        if result.stderr:
                            print(f"Command error: {result.stderr}")
                        
                        success = result.returncode == 0
                        message = result.stdout if success else f"Command failed: {result.stderr}"
                    
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
