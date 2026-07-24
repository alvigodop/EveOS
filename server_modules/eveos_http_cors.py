"""CORS origin allow-listing for the EveOS HTTP server.

Split out of server/python-server.py so the request handler stays under the project line cap.
The policy is deliberately narrow: reflect an Origin only for trusted local contexts (file://,
localhost, 127.0.0.1) or non-browser callers, so a random website cannot read the local
API responses while EveOS itself keeps working from both file:// and localhost.
"""

from __future__ import annotations


def eveos_cors_origin(origin):
    """Reflect the request Origin only if it's a trusted local context, else None (omit ACAO).
    Blocks a random website you visit from reading these local endpoints' responses, while
    keeping file://, localhost, 127.0.0.1, and same-origin/non-browser requests working."""
    o = (origin or "").strip()
    if not o:
        return "*"            # no Origin = same-origin or non-browser tool; no cross-origin risk
    lo = o.lower()
    if lo == "null" or lo.startswith("file://"):
        return "*"
    for host in ("http://localhost", "http://127.0.0.1", "https://localhost", "https://127.0.0.1"):
        if lo == host or lo.startswith(host + ":"):
            return o
    return None              # untrusted cross-origin -> omit header, browser blocks the read
