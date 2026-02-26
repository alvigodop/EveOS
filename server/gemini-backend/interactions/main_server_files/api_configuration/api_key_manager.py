"""
API key management functionality.
This module handles the API key storage and retrieval.
"""

import os

# Default API key - Note: This can be set via GOOGLE_API_KEY environment variable. 
# If empty, the server will rely on the client providing a key or an environment variable being set.
DEFAULT_API_KEY = ""

def get_api_key():
    """
    Get the API key for Gemini services.
    Prioritizes environment variable GOOGLE_API_KEY.
    """
    return os.environ.get("GOOGLE_API_KEY", DEFAULT_API_KEY)

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