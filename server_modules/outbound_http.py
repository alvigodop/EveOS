"""Shared safety policy for EveOS server-side outbound HTTP requests."""

from __future__ import annotations

import ipaddress
import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus


_PRIVATE_HOST_SUFFIXES = (".localhost", ".local", ".internal", ".lan")


def _is_public_address(raw_address):
    try:
        address = ipaddress.ip_address(str(raw_address or "").split("%", 1)[0])
    except ValueError:
        return False
    return address.is_global


def validate_public_http_target(target_url, resolve_dns=True):
    """Accept only HTTP(S) targets whose host resolves entirely to public IPs."""
    normalized = str(target_url or "").strip()
    try:
        parsed = urllib.parse.urlparse(normalized)
    except Exception:
        return False, "Invalid target URL"

    scheme = str(parsed.scheme or "").lower()
    host = str(parsed.hostname or "").strip().lower().rstrip(".")
    if scheme not in {"http", "https"}:
        return False, "Only http and https targets are allowed"
    if not host:
        return False, "Target host is missing"
    if parsed.username is not None or parsed.password is not None:
        return False, "Credentials are not allowed in target URLs"
    if host == "localhost" or host.endswith(_PRIVATE_HOST_SUFFIXES):
        return False, "Local network targets are not allowed"

    try:
        port = parsed.port
    except ValueError:
        return False, "Target port is invalid"

    try:
        literal_address = ipaddress.ip_address(host)
    except ValueError:
        literal_address = None
    if literal_address is not None:
        if not literal_address.is_global:
            return False, "Private or local network targets are not allowed"
        return True, ""

    if not resolve_dns:
        return True, ""

    try:
        addresses = {
            result[4][0]
            for result in socket.getaddrinfo(
                host,
                port or (443 if scheme == "https" else 80),
                type=socket.SOCK_STREAM,
            )
        }
    except OSError:
        return False, "Target host could not be resolved"

    if not addresses or any(not _is_public_address(address) for address in addresses):
        return False, "Target host resolves to a private or local network address"
    return True, ""


class PublicOnlyRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Reapply the public-target policy to every upstream redirect."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        allowed, reason = validate_public_http_target(newurl)
        if not allowed:
            raise urllib.error.HTTPError(
                newurl,
                HTTPStatus.FORBIDDEN,
                reason,
                headers,
                fp,
            )
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def build_public_opener(*handlers, ssl_context=None):
    """Build a request-local opener with verified TLS and guarded redirects."""
    context = ssl_context or ssl.create_default_context()
    return urllib.request.build_opener(
        *handlers,
        urllib.request.HTTPSHandler(context=context),
        PublicOnlyRedirectHandler(),
    )
