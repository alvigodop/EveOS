import base64
import importlib.util
import json
import logging
import os
import re
import shlex
import socket
import subprocess
import errno
from html import unescape
from html.parser import HTMLParser
from http import HTTPStatus
from types import SimpleNamespace
from urllib.parse import urljoin, urlparse

logger = logging.getLogger("FandomDiscoveryServer")

DEFAULT_WSL_DISTRO = "Ubuntu"

DEFAULT_RENDER_TIMEOUT_SECONDS = 45

BLOCKED_TITLE_TOKENS = (
    "just a moment",
    "attention required! | cloudflare",
    "access denied",
    "403 forbidden",
    "404 not found",
    "too many requests",
    "cloudflare_block",
)

def _is_client_disconnect(exc):
    if isinstance(exc, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
        return True
    if isinstance(exc, OSError):
        winerror = getattr(exc, "winerror", None)
        if winerror in (10053, 10054):
            return True
        if exc.errno in (errno.EPIPE, errno.ECONNRESET, errno.ECONNABORTED):
            return True
    return False

def _safe_send_response(handler, status, content_type, body_bytes):
    try:
        handler.send_response(status)
        handler.send_header("Content-Type", content_type)
        handler.end_headers()
        if body_bytes:
            handler.wfile.write(body_bytes)
        return True
    except Exception as exc:
        if _is_client_disconnect(exc):
            logger.info("Lightpanda: Client disconnected before response write completed.")
            return False
        raise
