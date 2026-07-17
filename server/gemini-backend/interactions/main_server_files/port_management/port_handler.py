import socket
import subprocess
import platform

def is_port_in_use(port):
    """Check if a port is in use on either IPv4 or IPv6."""
    # Check IPv4
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        ipv4_in_use = s.connect_ex(('127.0.0.1', port)) == 0
    
    # Check IPv6
    ipv6_in_use = False
    try:
        with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as s:
            ipv6_in_use = s.connect_ex(('::1', port)) == 0
    except socket.error:
        # IPv6 might not be supported
        pass
    
    return ipv4_in_use or ipv6_in_use

def free_port(port):
    """Attempt to free a port by killing the process using it.

    All process control runs through argument lists (shell=False) so nothing is passed
    through a shell parser — no quoting/injection surface, and the `:port` marker is matched
    in Python instead of by findstr/grep.
    """
    try:
        marker = f":{int(port)}"  # int() also rejects any non-numeric port up front
        if platform.system() == "Windows":
            result = subprocess.run(
                ["netstat", "-ano", "-p", "tcp"],
                shell=False,
                capture_output=True,
                text=True,
            )

            if result.stdout:
                pids = set()
                for line in result.stdout.strip().split('\n'):
                    if marker in line and "LISTENING" in line.upper():
                        parts = line.strip().split()
                        if len(parts) > 4 and parts[-1].isdigit():
                            pids.add(parts[-1])

                if pids:
                    for pid in pids:
                        print(f"Found process using port {port}: PID {pid}")
                        subprocess.run(["taskkill", "/F", "/PID", pid], shell=False)
                    return True
            return False
        elif platform.system() == "Linux" or platform.system() == "Darwin":  # Linux or macOS
            result = subprocess.run(
                ["lsof", "-nP", f"-iTCP{marker}", "-sTCP:LISTEN", "-t"],
                shell=False,
                capture_output=True,
                text=True,
            )

            if result.stdout:
                for pid in result.stdout.strip().split('\n'):
                    if pid.isdigit():
                        print(f"Found process using port {port}: PID {pid}")
                        subprocess.run(["kill", "-9", pid], shell=False)
                return True
            return False
        else:
            print(f"Unsupported operating system: {platform.system()}")
            return False
    except Exception as e:
        print(f"Error freeing port: {e}")
        return False