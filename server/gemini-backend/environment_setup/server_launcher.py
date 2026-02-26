from http.server import HTTPServer, BaseHTTPRequestHandler
import subprocess
import os
import signal
import json
import argparse
import logging

# Set up logging
logging.basicConfig(level=logging.ERROR,
                    format='%(asctime)s %(levelname)s:%(message)s')

# Declare the global variable at the module level
server_process = None

class LauncherHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        print("DEBUG: Sending CORS headers...")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Accept, Content-Type, Origin, Cache-Control')
        self.send_header('Access-Control-Max-Age', '3600')
        self.send_header('Access-Control-Expose-Headers', '*')

    def _send_response(self, status_code, message):
        print(f"DEBUG: Sending response: {status_code} - {message}")
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps({"message": message}).encode())

    def do_OPTIONS(self):
        print("DEBUG: Received OPTIONS request")
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        print(f"DEBUG: Received GET request for {self.path}")
        global server_process # Ensure global is declared first in the function scope
        
        if self.path == '/start-main':
            if server_process is None:
                try:
                    # Start the main server process
                    script_dir = os.path.dirname(os.path.abspath(__file__))
                    interactions_dir = os.path.abspath(os.path.join(script_dir, '..', 'interactions'))
                    main_script = os.path.join(interactions_dir, 'main.py')
                    server_process = subprocess.Popen(['python', main_script], cwd=script_dir)
                    self._send_response(200, "Main server started")
                except Exception as e:
                    self._send_response(500, f"Error starting main server: {str(e)}")
            else:
                self._send_response(400, "Main server already running")
        
        elif self.path == '/stop-main':
            if server_process is not None:
                try:
                    # Terminate the main server process
                    server_process.terminate()
                    server_process = None # Reset global variable after stopping
                    self._send_response(200, "Main server stopped")
                except Exception as e:
                    self._send_response(500, f"Error stopping main server: {str(e)}")
            else:
                self._send_response(400, "Main server not running")

        elif self.path == '/status':
            # Check the status of the main server process
            if server_process is not None and server_process.poll() is None:
                self._send_response(200, "running") # Process exists and hasn't terminated
            else:
                self._send_response(200, "stopped") # Process doesn't exist or has terminated
        else:
            self._send_response(404, "Not found")

    def do_HEAD(self):
        print(f"DEBUG: Received HEAD request for {self.path}")
        if self.path == '/status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
        else:
            # Respond with 404 for other paths for HEAD requests
            self.send_response(404)
            self.send_header('Content-type', 'text/plain') 
            self._send_cors_headers() # Send CORS headers even for errors
            self.end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Launcher Server')
    parser.add_argument('--port', type=int, default=9084, help='Port to run the launcher server on')
    args = parser.parse_args()
    
    print(f"Starting Launcher Server on port {args.port}...")
    server = None # Initialize server variable
    try:
        server = HTTPServer(('0.0.0.0', args.port), LauncherHandler)
        print(f"Launcher running on http://localhost:{args.port}")
        server.serve_forever()
    except Exception as e:
        error_msg = f"ERROR starting or running server: {e}"
        print(error_msg)
        logging.error(error_msg)
    finally:
        # Clean up server resources if it was created
        if server_process is not None:
            try:
                server_process.terminate()
                print("Terminated main server process.")
            except Exception as term_err:
                 error_msg = f"Error terminating main server process: {term_err}"
                 print(error_msg)
                 logging.error(error_msg)
        if server is not None:
            try:
                server.server_close()
                print("Launcher server closed.")
            except Exception as close_err:
                error_msg = f"Error closing launcher server: {close_err}"
                print(error_msg)
                logging.error(error_msg) 