import asyncio
import json
import websockets
from ...api_configuration.gemini_config import MAIN_MODEL as MODEL
from .utils import safe_send

# Track which connections have acquired a semaphore
semaphore_acquired = set()

# Model-specific concurrent session limits based on Google's rate limits
# Reference: https://ai.google.dev/gemini-api/docs/rate-limits
MODEL_SESSION_LIMITS = {
    "gemini-3.1-flash-live-preview": 2,
    "gemini-2.5-flash-native-audio-preview-12-2025": 1,
    "default": 2,
}

# Get the appropriate session limit for the current model
def get_session_limit_for_model(model_name):
    """Get the concurrent session limit for a specific model."""
    model_lower = model_name.lower()
    for model_pattern, limit in MODEL_SESSION_LIMITS.items():
        if model_pattern in model_lower:
            return limit
    return MODEL_SESSION_LIMITS["default"]

# Set up model-specific semaphore based on the main model
MAIN_MODEL_SESSION_LIMIT = get_session_limit_for_model(MODEL)
session_semaphore = asyncio.Semaphore(MAIN_MODEL_SESSION_LIMIT)

print(f"Session limit for {MODEL}: {MAIN_MODEL_SESSION_LIMIT} concurrent session(s)")

async def acquire_session_slot(websocket, connection_id, timeout=30):
    """Attempt to acquire a session slot with timeout."""
    try:
        if not session_semaphore.locked() and session_semaphore._value <= 0:
            print(f"Maximum concurrent sessions reached ({MAIN_MODEL_SESSION_LIMIT}). Connection {connection_id} will wait.")
            await safe_send(websocket, json.dumps({
                "text": f"Server is at maximum capacity ({MAIN_MODEL_SESSION_LIMIT} concurrent sessions). Please wait or try again later.",
                "is_system_message": True,
                "is_error": True
            }), connection_id)
        
        # Send a message to the client that they're in queue
        if websocket.state not in (websockets.protocol.State.CLOSED, websockets.protocol.State.CLOSING):
            await safe_send(websocket, json.dumps({
                "text": f"Waiting for an available session slot (timeout: {timeout}s)...",
                "is_system_message": True
            }), connection_id)
        else:
            print(f"Connection {connection_id} closed before acquiring semaphore")
            return False
        
        # Try to acquire the semaphore with a timeout
        try:
            acquire_success = await asyncio.wait_for(session_semaphore.acquire(), timeout=timeout)
            if acquire_success:
                semaphore_acquired.add(connection_id)
                print(f"Acquired session slot for connection {connection_id}")
                if websocket.state not in (websockets.protocol.State.CLOSED, websockets.protocol.State.CLOSING):
                    await safe_send(websocket, json.dumps({
                        "text": "Session slot acquired. Proceeding with connection...",
                        "is_system_message": True
                    }), connection_id)
                return True
        except asyncio.TimeoutError:
            acquire_success = False
        
        if not acquire_success:
            print(f"Timeout waiting for session slot for connection {connection_id}")
            if websocket.state not in (websockets.protocol.State.CLOSED, websockets.protocol.State.CLOSING):
                await safe_send(websocket, json.dumps({
                    "text": "Timeout waiting for an available session. Please try again later.",
                    "is_system_message": True,
                    "is_error": True
                }), connection_id)
            return False
            
    except Exception as e:
        print(f"Error acquiring session semaphore: {e}")
        await safe_send(websocket, json.dumps({
            "text": "Error acquiring session slot. Please try again.",
            "is_system_message": True,
            "is_error": True
        }), connection_id)
        return False
