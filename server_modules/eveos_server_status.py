"""Verified status contract for the canonical EveOS localhost server."""

SERVICE_NAME = "eveos-local-server"
SERVICE_VERSION = "0.6.0"


def build_status(server):
    bound_port = int(server.server_address[1])
    return {
        "ok": True,
        "status": "ok",
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "port": bound_port,
        "url": f"http://127.0.0.1:{bound_port}/EveOS.html",
    }
