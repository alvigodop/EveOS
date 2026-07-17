"""Lazy public facade for Gemini server initialization.

Importing configuration must stay side-effect free. Runtime modules are loaded
only when one of the compatibility exports is requested.
"""

from importlib import import_module

_EXPORT_MODULES = {
    "run_main_server": ".main_entry",
    "initialize_main_server": ".main_entry",
    "manage_server_lifecycle": ".server_lifecycle_manager",
    "cleanup_server": ".server_lifecycle_manager",
    "CLEANUP_INTERVAL_SEC": ".server_config",
    "CHAT_HISTORY_FILE": ".server_config",
}

__all__ = list(_EXPORT_MODULES)


def __getattr__(name):
    module_name = _EXPORT_MODULES.get(name)
    if module_name is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    value = getattr(import_module(module_name, __name__), name)
    globals()[name] = value
    return value