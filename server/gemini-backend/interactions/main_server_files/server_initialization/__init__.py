"""
Server initialization package.
Provides functionality for server setup and lifecycle management.
"""

from .main_entry import run_main_server, initialize_main_server
from .server_lifecycle_manager import manage_server_lifecycle, cleanup_server
from .server_config import CLEANUP_INTERVAL_SEC, CHAT_HISTORY_FILE

__all__ = [
    'run_main_server',
    'initialize_main_server',
    'manage_server_lifecycle',
    'cleanup_server',
    'CLEANUP_INTERVAL_SEC',
    'CHAT_HISTORY_FILE'
] 