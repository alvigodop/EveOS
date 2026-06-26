import time
import datetime

# Track active sessions to help with cleanup
active_sessions = {}

def register_active_session(connection_id, websocket):
    """Register a new active session."""
    active_sessions[connection_id] = {
        # Keep the websocket so single-owner routing can close other clients (see
        # disconnect_other_sessions) when a newer EveOS surface connects.
        "websocket": websocket,
        "connected_at": datetime.datetime.now().isoformat(),
        "last_active": time.time(),
        "remote": str(websocket.remote_address) if hasattr(websocket, 'remote_address') else "unknown"
    }

async def disconnect_other_sessions(keep_connection_id):
    """Single-owner routing: close every active Gemini session EXCEPT keep_connection_id.

    When EveOS connects from a new surface (e.g. the localhost site) this makes the newest client
    the sole owner of the Gemini link and cleanly cuts the previous one (e.g. the file:// site), so
    the live connection 'routes' to wherever just connected instead of being shared or queued.
    """
    others = [
        (cid, info) for cid, info in list(active_sessions.items())
        if cid != keep_connection_id and info.get("websocket") is not None
    ]
    for cid, info in others:
        websocket = info.get("websocket")
        try:
            print(f"[single-owner] Closing prior Gemini session {cid} (replaced by {keep_connection_id})")
            await websocket.close(code=4001, reason="Replaced by a newer EveOS connection")
        except Exception as error:
            print(f"[single-owner] Failed to close prior session {cid}: {error}")
    return len(others)

def update_session_activity(connection_id):
    """Update the last activity timestamp for a session."""
    if connection_id in active_sessions:
        active_sessions[connection_id]["last_active"] = time.time()

def get_active_sessions():
    """Get the current active sessions."""
    return active_sessions

def get_session_info(connection_id):
    """Get information about a specific session."""
    return active_sessions.get(connection_id)
