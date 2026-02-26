import time
import datetime

# Track active sessions to help with cleanup
active_sessions = {}

def register_active_session(connection_id, websocket):
    """Register a new active session."""
    active_sessions[connection_id] = {
        "connected_at": datetime.datetime.now().isoformat(),
        "last_active": time.time(),
        "remote": str(websocket.remote_address) if hasattr(websocket, 'remote_address') else "unknown"
    }

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
