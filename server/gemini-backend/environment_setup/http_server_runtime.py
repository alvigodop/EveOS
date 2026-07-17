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

def is_port_in_use(port):
    """Check if a port is in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def find_process_using_port(port):
    """Find the process ID using the specified port.

    Process discovery runs through argument lists (shell=False); the `:port` marker is
    matched in Python rather than by findstr, so nothing crosses a shell parser.
    """
    marker = f":{int(port)}"
    if os.name == 'nt':  # Windows
        try:
            output = subprocess.check_output(["netstat", "-ano", "-p", "tcp"], shell=False).decode(errors="ignore")
            if output:
                for line in output.strip().split('\n'):
                    if marker in line and ('LISTENING' in line.upper() or 'ESTABLISHED' in line.upper()):
                        parts = line.strip().split()
                        if len(parts) >= 5 and parts[-1].isdigit():
                            return int(parts[-1])
        except subprocess.CalledProcessError:
            pass
    else:  # Linux/Mac
        try:
            output = subprocess.check_output(["lsof", "-nP", f"-iTCP{marker}", "-sTCP:LISTEN", "-t"], shell=False).decode(errors="ignore")
            if output:
                first = output.strip().split('\n')[0]
                if first.isdigit():
                    return int(first)
        except subprocess.CalledProcessError:
            pass
    return None

def kill_process(pid):
    """Kill a process by its PID."""
    if os.name == 'nt':  # Windows
        try:
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], shell=False, check=True)
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
