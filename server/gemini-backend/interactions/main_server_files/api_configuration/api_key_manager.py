"""
API key management functionality.
This module handles the API key storage and retrieval.
"""

import os
import sys
from pathlib import Path

# Default API key - Note: This can be set via GOOGLE_API_KEY environment variable.
# If empty, the server will rely on the saved credential vault or an environment variable being set.
DEFAULT_API_KEY = ""

def load_vault_api_key():
    """Load the locally saved EveOS Gemini key without exposing it to the browser."""
    try:
        project_root = Path(__file__).resolve().parents[5]
        if str(project_root) not in sys.path:
            sys.path.insert(0, str(project_root))
        from server_modules.gemini_credentials import load_api_key
        return load_api_key()
    except (ImportError, OSError, ValueError):
        return ""


def get_api_key():
    """
    Get the API key for Gemini services.
    Prioritizes the local credential vault saved by EveOS Session Controls.
    """
    vault_key = load_vault_api_key()
    if vault_key:
        return vault_key

    environment_key = os.environ.get("GOOGLE_API_KEY", DEFAULT_API_KEY)
    if environment_key:
        return environment_key

    return DEFAULT_API_KEY


def persist_api_key(api_key):
    """Persist a validated client key into the local EveOS credential vault."""
    if not validate_api_key(api_key):
        return False
    try:
        project_root = Path(__file__).resolve().parents[5]
        if str(project_root) not in sys.path:
            sys.path.insert(0, str(project_root))
        from server_modules.gemini_credentials import save_api_key
        return bool(save_api_key(api_key).get("ok"))
    except (ImportError, OSError, ValueError):
        return False


def validate_api_key(api_key):
    """
    Validate the format of the API key.
    Returns True if the key appears valid, False otherwise.
    """
    if not api_key or not isinstance(api_key, str):
        return False
    if len(api_key) < 10:  # Basic length check
        return False
    return True
