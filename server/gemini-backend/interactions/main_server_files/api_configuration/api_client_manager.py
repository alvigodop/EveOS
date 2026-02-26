"""
API client manager module.
Handles the initialization and setup of the Gemini API client.
"""

import sys
from .api_key_manager import get_api_key, validate_api_key
from .api_initialization import print_api_initialization, print_api_status
from .gemini_config import configure_gemini_api, create_gemini_client

def initialize_api_client(api_key=None):
    """
    Initialize and configure the Gemini API client.
    Args:
        api_key (str, optional): The API key to use. If not provided, it's fetched from key manager.
    Returns:
        The configured Gemini client instance
    """
    try:
        # Use provided key or get API key from the api_key_manager
        if not api_key:
            api_key = get_api_key()
        
        # Validate API key
        if not api_key or not validate_api_key(api_key):
            print("\n[NOTE] No default Gemini API key found in environment variables.")
            print("The server will wait for the client to provide an API key per session.")
            return None # Return None instead of exiting to allow for session-level error handling

        # Print API initialization information and configure API
        print_api_initialization(api_key)
        configure_gemini_api(api_key)
        
        # Create and return the client
        return create_gemini_client(api_key)
    except Exception as e:
        print(f"\n====== WARNING: API CLIENT INITIALIZATION FAILED ======")
        print(f"Error details: {str(e)}")
        print("Sessions will require an API key from the client.")
        return None

def setup_api_environment():
    """
    Set up the complete API environment including status printing.
    Returns:
        The configured Gemini client instance or None if initialization fails
    """
    try:
        print_api_status()
        return initialize_api_client()
    except Exception as e:
        print(f"\n====== WARNING: INITIAL API SETUP FAILED ======")
        print(f"Error details: {str(e)}")
        print("The server will continue, but sessions will require an API key from the client.")
        return None