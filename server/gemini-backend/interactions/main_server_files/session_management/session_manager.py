"""
Manages Gemini session initialization and configuration.
This module handles the core logic for creating and configuring new Gemini sessions.
Refactored to use a modular core architecture.
"""

from .core.utils import safe_send
from .core.session_registry import (
    active_sessions,
    register_active_session,
    update_session_activity,
    get_active_sessions,
    get_session_info,
    set_session_role,
    disconnect_other_sessions
)
from .core.session_limits import (
    MODEL_SESSION_LIMITS,
    get_session_limit_for_model,
    MAIN_MODEL_SESSION_LIMIT,
    session_semaphore,
    acquire_session_slot,
    semaphore_acquired
)
from .core.session_cleanup import (
    cleanup_resources,
    periodic_cleanup
)
# Re-export key components for backward compatibility
__all__ = [
    'active_sessions',
    'register_active_session',
    'update_session_activity',
    'get_active_sessions',
    'get_session_info',
    'set_session_role',
    'disconnect_other_sessions',
    'MODEL_SESSION_LIMITS',
    'get_session_limit_for_model',
    'MAIN_MODEL_SESSION_LIMIT',
    'session_semaphore',
    'acquire_session_slot',
    'semaphore_acquired',
    'cleanup_resources',
    'periodic_cleanup',
    'safe_send'
]
