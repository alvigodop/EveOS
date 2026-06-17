import json
import os
import socket
import sys
from google import genai
import google.generativeai as generative

# Configurable timeout settings for addressing deadline errors
class TimeoutConfig:
    """Centralized timeout configuration for addressing deadline exceeded errors"""
    # API client timeouts
    CLIENT_TIMEOUT = 300  # 5 minutes - HTTP client timeout
    
    # Response receiving timeouts (addressing the main deadline issue)
    RESPONSE_TIMEOUT = 75  # Increased from 45s to 75s for backend delays
    RESPONSE_TIMEOUT_EXTENDED = 90  # For retry attempts
    
    # WebSocket timeouts
    WEBSOCKET_PING_TIMEOUT = 120  # Increased from 90s
    WEBSOCKET_CLOSE_TIMEOUT = 60   # Increased from 45s
    WEBSOCKET_OPEN_TIMEOUT = 60    # Increased from 45s
    
    # Circuit breaker and retry settings
    MAX_CONSECUTIVE_DEADLINE_ERRORS = 3  # Reduced for faster circuit breaker activation
    DEADLINE_RETRY_BASE_DELAY = 5  # Base delay for deadline retries (seconds)
    CIRCUIT_BREAKER_COOLDOWN = 180  # Reduced from 300s to 3 minutes
    
    @classmethod
    def get_response_timeout(cls, retry_attempt: int = 0) -> int:
        """Get response timeout based on retry attempt"""
        if retry_attempt == 0:
            return cls.RESPONSE_TIMEOUT
        else:
            # Gradually increase timeout for retries
            return min(cls.RESPONSE_TIMEOUT_EXTENDED, cls.RESPONSE_TIMEOUT + (retry_attempt * 15))

# API usage monitoring
class APIUsageMonitor:
    """Monitor API usage to help identify quota and rate limit issues"""
    def __init__(self):
        self.request_count = 0
        self.error_count = 0
        self.deadline_error_count = 0
        self.last_reset = None
        
    def increment_request(self):
        self.request_count += 1
        
    def increment_error(self):
        self.error_count += 1
        
    def increment_deadline_error(self):
        self.deadline_error_count += 1
        
    def get_stats(self):
        return {
            "requests": self.request_count,
            "errors": self.error_count,
            "deadline_errors": self.deadline_error_count,
            "error_rate": self.error_count / max(self.request_count, 1),
            "deadline_error_rate": self.deadline_error_count / max(self.request_count, 1)
        }

# Global usage monitor instance
usage_monitor = APIUsageMonitor()

_LIVE_IPV4_PATCHED = False

def _env_enabled(name, default=True):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() not in {"0", "false", "off", "no"}

def install_live_websocket_ipv4_patch():
    """Force Gemini Live's WebSocket connector through IPv4 when enabled.

    Google can reject IP-restricted API keys when the Live WebSocket exits over
    an IPv6 address that is not on the key allowlist. The google-genai client
    currently drops low-level WebSocket kwargs passed through HttpOptions, so we
    patch only the module-level Live connector used by this backend.
    """
    global _LIVE_IPV4_PATCHED
    if _LIVE_IPV4_PATCHED or not _env_enabled("EVEOS_GEMINI_FORCE_IPV4", True):
        return _LIVE_IPV4_PATCHED

    try:
        import google.genai.live as live_module

        original_connect = live_module.ws_connect
        if getattr(live_module, "_eveos_ipv4_ws_connect", False):
            _LIVE_IPV4_PATCHED = True
            return True

        def eveos_ipv4_ws_connect(*args, **kwargs):
            kwargs.setdefault("family", socket.AF_INET)
            return original_connect(*args, **kwargs)

        eveos_ipv4_ws_connect.__name__ = "eveos_ipv4_ws_connect"
        live_module.ws_connect = eveos_ipv4_ws_connect
        live_module._eveos_ipv4_ws_connect = True
        _LIVE_IPV4_PATCHED = True
        print("[OK] Gemini Live WebSocket IPv4 routing enabled")
        return True
    except Exception as exc:
        print(f"[WARN] Gemini Live IPv4 routing patch unavailable: {exc}")
        return False

def configure_gemini_api(api_key):
    """Configure the Gemini API with the given key."""
    try:
        print("\nInitializing Gemini API...")
        generative.configure(api_key=api_key)
        print("[OK] API configuration successful")
    except Exception as e:
        print(f"\n====== ERROR: FAILED TO CONFIGURE API ======")
        print(f"Error details: {str(e)}")
        print("\nPossible causes:")
        print("1. Invalid API key format or expired key")
        print("2. No internet connection")
        print("3. Gemini API service unavailable")
        print("\nThe server will now exit. Press any key to close this window...")
        sys.exit(1)

def create_gemini_client(api_key):
    """Create and configure a Gemini client with enhanced timeout settings."""
    try:
        print("\nConfiguring Gemini client with enhanced timeout settings...")
        install_live_websocket_ipv4_patch()
        client = genai.Client(
            api_key=api_key,
            http_options={
                'api_version': 'v1beta',  # Using v1beta for access to preview models/features. 
                # Note: v1beta is subject to breaking changes and not recommended for production if stability is critical. 
                # For a stable production environment, consider using 'v1'.
                'timeout': TimeoutConfig.CLIENT_TIMEOUT,  # Use configurable timeout
            }
        )
        print(f"[OK] Client configured successfully with {TimeoutConfig.CLIENT_TIMEOUT}s timeout")
        print(f"[OK] Response timeout set to {TimeoutConfig.RESPONSE_TIMEOUT}s (extended to {TimeoutConfig.RESPONSE_TIMEOUT_EXTENDED}s for retries)")
        return client
    except Exception as e:
        print(f"\n====== ERROR: FAILED TO INITIALIZE GEMINI CLIENT ======")
        print(f"Error details: {str(e)}")
        print("\nPossible causes:")
        print("1. Invalid API key or unauthorized access")
        print("2. No internet connection")
        print("3. Requested model not available")
        print("4. Gemini API service is down or overloaded")
        print("\nThe server will now exit. Press any key to close this window...")
        sys.exit(1)

def create_gemini_config(voice_name="Aoede", context=None, generation_config=None, safety_settings=None, speaking_rate=1.0, pitch=0.0):
    """Create configuration for Gemini session with optional context and overrides."""
    
    # Default generation config
    gen_config = {
        "temperature": 0.9,
        "top_k": 1,
        "top_p": 1,
        "candidate_count": 1,
        "max_output_tokens": 2048,
        "stop_sequences": []
    }
    
    # Valid keys for GenerationConfig
    valid_gen_keys = ["temperature", "top_k", "top_p", "candidate_count", "max_output_tokens", "stop_sequences"]
    
    # Extract response_modalities separately - it belongs at the top level, NOT in generation_config
    
    # 1. Check for client-provided modalities (camelCase or snake_case)
    client_modalities = None
    if generation_config:
        if "responseModalities" in generation_config and isinstance(generation_config["responseModalities"], list):
            client_modalities = generation_config["responseModalities"]
        elif "response_modalities" in generation_config and isinstance(generation_config["response_modalities"], list):
            client_modalities = generation_config["response_modalities"]

    # 2. Determine final modalities
    # HOTFIX: Gemini 2.5 currently crashes (Error 1007) if TEXT is requested. 
    # Forcing AUDIO-only for this model regardless of client request.
    if "gemini-2.5" in MAIN_MODEL:
        response_modalities = ["AUDIO"]
    elif client_modalities:
        response_modalities = client_modalities
    else:
        # Default for other models (like 2.0-flash-exp) that support both
        response_modalities = ["TEXT", "AUDIO"]

    # Apply overrides if provided
    if generation_config:
        # Mapping from client-side keys (often camelCase) to server-side keys
        if "temperature" in generation_config: gen_config["temperature"] = generation_config["temperature"]
        if "topK" in generation_config: gen_config["top_k"] = generation_config["topK"]
        if "topP" in generation_config: gen_config["top_p"] = generation_config["topP"]
        if "maxOutputTokens" in generation_config: gen_config["max_output_tokens"] = generation_config["maxOutputTokens"]
        
        # Also check for snake_case keys just in case
        if "top_k" in generation_config: gen_config["top_k"] = generation_config["top_k"]
        if "top_p" in generation_config: gen_config["top_p"] = generation_config["top_p"]
        if "max_output_tokens" in generation_config: gen_config["max_output_tokens"] = generation_config["max_output_tokens"]
        if "candidate_count" in generation_config: gen_config["candidate_count"] = generation_config["candidate_count"]
        if "stop_sequences" in generation_config: gen_config["stop_sequences"] = generation_config["stop_sequences"]

    base_config = {
        "generation_config": gen_config,
        "response_modalities": response_modalities,
        "speech_config": {
            "voice_config": {
                "prebuilt_voice_config": {
                    "voice_name": voice_name
                    # "speaking_rate": speaking_rate, 
                    # "pitch": pitch 
                }
            }
        }
    }
    
    # if safety_settings:
    #     base_config["safety_settings"] = safety_settings
    
    from google.genai import types
    if context:
         full_context = context
         base_config["system_instruction"] = types.Content(parts=[types.Part(text=full_context)])
    
    return base_config

# Define model names as constants, gemini-2.5-flash-preview-native-audio-dialog, gemini-2.0-flash-exp, gemini-2.0-flash-live-001
MAIN_MODEL = "gemini-2.5-flash-native-audio-latest"
TRANSCRIPTION_MODEL = "gemini-2.0-flash"  # Text-only model for transcription

# Configure default generation settings for transcription
TRANSCRIPTION_CONFIG = {
    "temperature": 0.1,  # Lower temperature for more focused transcription
    "top_k": 1,
    "top_p": 0.8,
    "max_output_tokens": 1024,
}

# Alias MODEL to MAIN_MODEL for backward compatibility
MODEL = MAIN_MODEL 
