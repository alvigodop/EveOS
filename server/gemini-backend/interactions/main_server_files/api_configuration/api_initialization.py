"""
API initialization and status reporting functionality.
This module handles the initialization and status reporting of the Gemini API.
"""

import sys
from importlib.metadata import PackageNotFoundError, version

import websockets
from .gemini_config import MAIN_MODEL, TRANSCRIPTION_MODEL

def print_api_status():
    """Print API status information including versions and configuration."""
    print("\n====== STARTING SERVER ======")
    print(f"Python version: {sys.version}")
    print(f"Websockets version: {websockets.__version__}")
    try:
        sdk_version = version("google-genai")
    except PackageNotFoundError:
        sdk_version = "not installed"
    print(f"Google Gen AI SDK version: {sdk_version}")
    
def print_api_initialization(api_key):
    """Print API initialization information."""
    print(f"\n====== INITIALIZATION ======")
    print("Starting server with a configured Gemini credential (value hidden)")
    print(f"\nUsing models:")
    print(f"- Main model (multimodal): {MAIN_MODEL}")
    print(f"- Transcription model (text-only): {TRANSCRIPTION_MODEL}")
