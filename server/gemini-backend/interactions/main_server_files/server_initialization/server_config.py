"""
Server configuration settings and constants.
"""

# Global cleanup interval for session cleanup task (seconds)
CLEANUP_INTERVAL_SEC = 60

# Default WebSocket server port
DEFAULT_PORT = 8765

# Default status server port (WebSocket port + 1)
STATUS_PORT = DEFAULT_PORT + 1

# Chat history file path
CHAT_HISTORY_FILE = "chat_history.json" 