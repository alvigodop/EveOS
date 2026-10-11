"""Lightweight, read-only Local Control CLI parsing and branded health probe.

The probe must not import service controllers or capture/update source baselines before its
deadline begins. Launchers use it to observe an existing process, never to initialize one.
"""
from __future__ import annotations

import argparse
import http.client
import io
import json
import socket
import time

from . import eveos_ports

_MAX_HEALTH_BYTES = 64 * 1024


def _remaining(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("control-plane probe deadline expired")
    return min(1.0, remaining)


class _DeadlineReader(io.RawIOBase):
    """Budget every underlying read, including buffered header/body reads."""

    def __init__(self, connection: socket.socket, deadline: float):
        self.connection = connection
        self.deadline = deadline

    def readable(self):
        return True

    def readinto(self, buffer):
        self.connection.settimeout(_remaining(self.deadline))
        return self.connection.recv_into(buffer)


class _ResponseSocket:
    def __init__(self, connection: socket.socket, deadline: float):
        self.connection = connection
        self.deadline = deadline

    def makefile(self, _mode):
        return io.BufferedReader(_DeadlineReader(self.connection, self.deadline))


def _health_payload(port: int, deadline: float):
    # Numeric IPv4 avoids DNS work; both contexts close before retrying or returning.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
        connection.settimeout(_remaining(deadline))
        connection.connect(("127.0.0.1", port))
        connection.settimeout(_remaining(deadline))
        connection.sendall(
            f"GET /api/control-plane/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n"
            "Connection: close\r\n\r\n".encode("ascii")
        )
        with http.client.HTTPResponse(_ResponseSocket(connection, deadline)) as response:
            response.begin()
            if response.status != 200:
                return None
            body = response.read(_MAX_HEALTH_BYTES + 1)
            if len(body) > _MAX_HEALTH_BYTES:
                return None
            return json.loads(body)


def parse_args():
    parser = argparse.ArgumentParser(description="EveOS file-mode local control plane")
    parser.add_argument("port", nargs="?", type=int,
                        default=eveos_ports.service_port("GEMINI_CONTROL_PORT"))
    parser.add_argument("--probe", action="store_true", help="Wait for a verified control plane and exit")
    parser.add_argument("--timeout", type=float, default=30.0, help="Probe timeout in seconds")
    parser.add_argument("--scoped-restart", action="store_true",
                        help="Start Local Control without restoring unrelated desired child services")
    return parser.parse_args()


def wait_for_control(port: int, timeout: float) -> int:
    deadline = time.monotonic() + max(0.1, timeout)
    while time.monotonic() < deadline:
        try:
            payload = _health_payload(port, deadline)
            if time.monotonic() < deadline and isinstance(payload, dict) \
                    and payload.get("service") == "eveos-control-plane":
                return 0
        except (OSError, ValueError, http.client.HTTPException):
            pass
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(0.2, remaining))
    return 1
