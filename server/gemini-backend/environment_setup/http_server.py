from http.server import HTTPServer
import argparse
import os
import signal
import ssl
import sys
import time

from http_server_request_handler import CORSRequestHandler
from http_server_runtime import (
    create_self_signed_cert,
    find_process_using_port,
    free_port,
    is_port_in_use,
    kill_process,
    signal_handler,
)

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)
if hasattr(signal, "SIGBREAK"):
    signal.signal(signal.SIGBREAK, signal_handler)


def run_server(port=8000, use_https=True):
    """Run the HTTP/HTTPS server on the specified port."""
    global httpd

    if is_port_in_use(port):
        print(f"Port {port} is already in use. Attempting to free it...")
        if free_port(port):
            print(f"Successfully freed port {port}")
            time.sleep(1)
        else:
            print(f"Failed to free port {port}. Please check manually.")
            return False

    try:
        server_address = ('', port)
        httpd = HTTPServer(server_address, CORSRequestHandler)

        if use_https:
            try:
                cert_file, key_file = create_self_signed_cert()
                if cert_file and key_file and os.path.exists(cert_file) and os.path.exists(key_file):
                    context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
                    context.load_cert_chain(cert_file, key_file)
                    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
                    print(f'Starting HTTPS server on port {port}...')
                    print(f'Server is running at https://localhost:{port}/')
                    print(f'Access the interface at https://localhost:{port}/gemini_chat_interface.html')
                    print('Note: You may need to accept the self-signed certificate in your browser')
                else:
                    print('SSL certificates not available, falling back to HTTP')
                    print(f'Starting HTTP server on port {port}...')
                    print(f'Server is running at http://localhost:{port}/')
                    print(f'Access the interface at http://localhost:{port}/gemini_chat_interface.html')
                    print('Warning: Running over HTTP - some audio features may not work (requires HTTPS)')
            except Exception as ssl_error:
                print(f'SSL setup failed: {ssl_error}')
                print('Falling back to HTTP mode')
                print(f'Starting HTTP server on port {port}...')
                print(f'Server is running at http://localhost:{port}/')
                print(f'Access the interface at http://localhost:{port}/gemini_chat_interface.html')
                print('Warning: Running over HTTP - some audio features may not work (requires HTTPS)')
        else:
            print(f'Starting HTTP server on port {port}...')
            print(f'Server is running at http://localhost:{port}/')
            print(f'Access the interface at http://localhost:{port}/gemini_chat_interface.html')
            print('Warning: Running over HTTP - some audio features may not work (requires HTTPS)')

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
            except Exception:
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
        print(f'Error parsing arguments: {e}')
        sys.exit(1)
