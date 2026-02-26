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

# Add a constant for the static files directory
# STATIC_DIR should be the project root (Workshop/)
# Current file: server/gemini-backend/environment_setup/http_server.py
STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

def signal_handler(signum, frame):
    print("\nSignal received, shutting down server...")
    if 'httpd' in globals():
        try:
            # Set a timeout for the shutdown
            httpd.timeout = 3
            # Stop accepting new requests
            httpd.socket.close()
            # Force immediate shutdown
            os._exit(0)
        except:
            # If anything fails, force exit
            os._exit(0)
    else:
        os._exit(0)

# Register signal handlers for both Unix and Windows signals
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)
if hasattr(signal, 'SIGBREAK'):  # Windows-specific signal
    signal.signal(signal.SIGBREAK, signal_handler)

def create_self_signed_cert():
    """Create a self-signed certificate for HTTPS"""
    cert_dir = os.path.join(os.path.dirname(__file__), 'ssl')
    cert_file = os.path.join(cert_dir, 'server.crt')
    key_file = os.path.join(cert_dir, 'server.key')
    
    # Check if certificates already exist
    if os.path.exists(cert_file) and os.path.exists(key_file):
        # Verify they aren't placeholders
        try:
            with open(cert_file, 'r') as f:
                content = f.read()
                if "Placeholder" in content:
                    print("Removing old placeholder SSL certificates...")
                    os.remove(cert_file)
                    os.remove(key_file)
                else:
                    print(f"Using existing SSL certificates from {cert_dir}")
                    return cert_file, key_file
        except:
            pass
    
    # Create SSL directory if it doesn't exist
    os.makedirs(cert_dir, exist_ok=True)
    
    try:
        # Try to use openssl if available
        cmd = [
            'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-keyout', key_file,
            '-out', cert_file, '-days', '365', '-nodes', '-subj',
            '/C=US/ST=Local/L=Local/O=SRT-Gemini/CN=localhost'
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            print(f"Created self-signed SSL certificate in {cert_dir}")
            return cert_file, key_file
        else:
            print(f"OpenSSL failed: {result.stderr}")
            
    except Exception as e:
        print(f"OpenSSL not available or failed: {e}")
    
    return None, None

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

def is_port_in_use(port):
    """Check if a port is in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def find_process_using_port(port):
    """Find the process ID using the specified port."""
    if os.name == 'nt':  # Windows
        try:
            # Use netstat to find the process using the port
            output = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True).decode()
            if output:
                # Extract the PID from the output
                lines = output.strip().split('\n')
                for line in lines:
                    if f':{port}' in line and ('LISTENING' in line or 'ESTABLISHED' in line):
                        parts = line.strip().split()
                        if len(parts) >= 5:
                            return int(parts[-1])
        except subprocess.CalledProcessError:
            pass
    else:  # Linux/Mac
        try:
            # Use lsof to find the process using the port
            output = subprocess.check_output(f'lsof -i :{port} -t', shell=True).decode()
            if output:
                return int(output.strip())
        except subprocess.CalledProcessError:
            pass
    return None

def kill_process(pid):
    """Kill a process by its PID."""
    if os.name == 'nt':  # Windows
        try:
            subprocess.run(f'taskkill /F /PID {pid}', shell=True, check=True)
            print(f"Process with PID {pid} has been terminated.")
            return True
        except subprocess.CalledProcessError:
            print(f"Failed to terminate process with PID {pid}.")
            return False
    else:  # Linux/Mac
        try:
            os.kill(pid, signal.SIGTERM)
            print(f"Process with PID {pid} has been terminated.")
            return True
        except OSError:
            print(f"Failed to terminate process with PID {pid}.")
            return False

def free_port(port):
    """Free up a port by killing the process using it."""
    pid = find_process_using_port(port)
    if pid:
        print(f"Found process using port {port}: PID {pid}")
        return kill_process(pid)
    return False

def run_server(port=8000, use_https=True):
    """Run the HTTP/HTTPS server on the specified port."""
    global httpd
    
    # Check if the port is already in use
    if is_port_in_use(port):
        print(f"Port {port} is already in use. Attempting to free it...")
        if free_port(port):
            print(f"Successfully freed port {port}")
            # Wait a moment for the port to be fully released
            time.sleep(1)
        else:
            print(f"Failed to free port {port}. Please check manually.")
            return False
    
    try:
        server_address = ('', port)
        httpd = HTTPServer(server_address, CORSRequestHandler)
        
        # Try to set up HTTPS if requested
        if use_https:
            try:
                cert_file, key_file = create_self_signed_cert()
                if cert_file and key_file and os.path.exists(cert_file) and os.path.exists(key_file):
                    # Create SSL context
                    context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
                    context.load_cert_chain(cert_file, key_file)
                    
                    # Wrap the socket with SSL
                    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
                    
                    protocol = "https"
                    print(f'Starting HTTPS server on port {port}...')
                    print(f'Server is running at https://localhost:{port}/')
                    print(f'Access the interface at https://localhost:{port}/gemini_chat_interface.html')
                    print('Note: You may need to accept the self-signed certificate in your browser')
                else:
                    print("SSL certificates not available, falling back to HTTP")
                    protocol = "http"
                    print(f'Starting HTTP server on port {port}...')
                    print(f'Server is running at http://localhost:{port}/')
                    print(f'Access the interface at http://localhost:{port}/gemini_chat_interface.html')
                    print('Warning: Running over HTTP - some audio features may not work (requires HTTPS)')
            except Exception as ssl_error:
                print(f"SSL setup failed: {ssl_error}")
                print("Falling back to HTTP mode")
                protocol = "http"
                print(f'Starting HTTP server on port {port}...')
                print(f'Server is running at http://localhost:{port}/')
                print(f'Access the interface at http://localhost:{port}/gemini_chat_interface.html')
                print('Warning: Running over HTTP - some audio features may not work (requires HTTPS)')
        else:
            protocol = "http"
            print(f'Starting HTTP server on port {port}...')
            print(f'Server is running at http://localhost:{port}/')
            print(f'Access the interface at http://localhost:{port}/gemini_chat_interface.html')
            print('Warning: Running over HTTP - some audio features may not work (requires HTTPS)')
        
        # Set socket timeout to allow for clean shutdown
        httpd.socket.settimeout(3)
        print('Press Ctrl+C to stop the server')
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped by user')
    except Exception as e:
        print(f'Error starting server: {e}')
        return False
    finally:
        if 'httpd' in globals():
            try:
                httpd.socket.close()
            except:
                pass
        print('Server closed')
    return True

if __name__ == '__main__':
    try:
        parser = argparse.ArgumentParser(description='Start HTTP/HTTPS server on specified port')
        parser.add_argument('--port', type=int, default=8000, help='Port to run server on')
        parser.add_argument('--http', action='store_true', help='Force HTTP instead of HTTPS')
        args = parser.parse_args()
        use_https = not args.http
        print(f"Starting {'HTTPS' if use_https else 'HTTP'} server with port {args.port}")
        run_server(args.port, use_https)
    except Exception as e:
        print(f"Error parsing arguments: {e}")
        sys.exit(1) 