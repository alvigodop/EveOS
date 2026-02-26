import asyncio
import json
from ...error_handling.api_error_handler import api_error_handler
from ...api_configuration.gemini_config import create_gemini_config
from ...error_handling.session_initialization_handler import handle_session_initialization_error
from .utils import safe_send

async def create_gemini_session(client, voice_name, context, websocket, safe_send_fn, model, connection_id):
    """
    Create and initialize a new Gemini session with the given configuration.
    Enhanced with retry logic for preview models, especially gemini-2.5-flash-preview-native-audio-dialog.
    """
    # Note: safe_send_fn is passed in to match original signature, but we also have imported safe_send
    # We will use the passed one to be safe as it might be bound to something or be a wrapper.
    # Actually, in the original code it was passed in.
    
    try:
        # Create configuration using the centralized config creator
        config = create_gemini_config(voice_name=voice_name)
        print(f"Initializing Gemini session with voice: {voice_name}, model: {model}")
        
        # Enhanced retry logic for preview models
        is_preview_model = any(keyword in model.lower() for keyword in ["preview", "experimental", "beta", "alpha"])
        is_native_audio_dialog = "native-audio-dialog" in model.lower()
        
        # Set retry parameters based on model type
        if is_native_audio_dialog:
            max_retries = 5  # More retries for the problematic native-audio-dialog model
            retry_delays = [2, 5, 10, 15, 20]  # Progressive backoff
        elif is_preview_model:
            max_retries = 4
            retry_delays = [1, 3, 7, 12]
        else:
            max_retries = 2
            retry_delays = [1, 3]
        
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    delay = retry_delays[min(attempt-1, len(retry_delays)-1)]
                    print(f"Retrying connection attempt {attempt+1}/{max_retries} for {model} after {delay}s delay...")
                    
                    # Send specific retry message for native-audio-dialog
                    if is_native_audio_dialog:
                        await safe_send_fn(websocket, json.dumps({
                            "text": f"Retrying connection to {model} (attempt {attempt+1}/{max_retries}). This model is highly experimental and often requires multiple attempts...",
                            "is_system_message": True
                        }), connection_id)
                    else:
                        await safe_send_fn(websocket, json.dumps({
                            "text": f"Retrying connection to {model} (attempt {attempt+1}/{max_retries})...",
                            "is_system_message": True
                        }), connection_id)
                    
                    await asyncio.sleep(delay)
                
                print(f"Connecting to Gemini API for connection: {connection_id} using model: {model}")
                session = await client.aio.live.connect(model=model, config=config)
                print(f"Connected to Gemini API with voice: {voice_name}, model: {model}")
                
                # Reset error count on successful connection using the singleton instance
                api_error_handler.reset_error_count(connection_id)
                
                # Send success message to client
                success_msg = f"Successfully connected to {model}"
                if is_native_audio_dialog:
                    success_msg += " (experimental native audio dialog model)"
                
                await safe_send_fn(websocket, json.dumps({
                    "text": success_msg,
                    "is_system_message": True
                }), connection_id)
                
                return session
                
            except Exception as e:
                error_msg = str(e).lower()
                print(f"Connection attempt {attempt+1} failed for {model}: {e}")
                
                # Check for specific errors and provide helpful messages
                if is_native_audio_dialog:
                    if "session creation failed" in error_msg or "connection" in error_msg:
                        print(f"Native audio dialog model connection issue (attempt {attempt+1}): {e}")
                        await safe_send_fn(websocket, json.dumps({
                            "text": f"Connection issue with {model} (attempt {attempt+1}). This highly experimental model has known stability issues...",
                            "is_system_message": True
                        }), connection_id)
                    elif "quota" in error_msg or "rate" in error_msg:
                        print(f"Quota/rate limit issue with {model}: {e}")
                        await safe_send_fn(websocket, json.dumps({
                            "text": f"Rate limit reached for {model}. This model has stricter limits due to its experimental nature...",
                            "is_system_message": True
                        }), connection_id)
                elif is_preview_model:
                    if "quota" in error_msg:
                        print(f"API quota exceeded for {model}, waiting before retry...")
                        await safe_send_fn(websocket, json.dumps({
                            "text": f"API quota exceeded for {model}. Retrying in a moment...",
                            "is_system_message": True
                        }), connection_id)
                    elif "connection" in error_msg or "timeout" in error_msg:
                        print(f"Connection issue with preview model {model}, retrying...")
                        await safe_send_fn(websocket, json.dumps({
                            "text": f"Connection issue with {model}. Preview models can be unstable. Retrying...",
                            "is_system_message": True
                        }), connection_id)
                    elif "session" in error_msg or "unavailable" in error_msg:
                        print(f"Session creation failed for preview model {model}, retrying...")
                        await safe_send_fn(websocket, json.dumps({
                            "text": f"Session creation failed for {model}. Preview models may have intermittent issues. Retrying...",
                            "is_system_message": True
                        }), connection_id)
                
                # If this is the last attempt, handle the error normally
                if attempt == max_retries - 1:
                    # Send model-specific guidance
                    if is_native_audio_dialog:
                        await safe_send_fn(websocket, json.dumps({
                            "text": f"Failed to connect to {model} after {max_retries} attempts. This experimental native audio model is known to be highly unstable. Please try again in a few moments or consider using a more stable model.",
                            "is_system_message": True,
                            "is_error": True
                        }), connection_id)
                    elif is_preview_model:
                        await safe_send_fn(websocket, json.dumps({
                            "text": f"Failed to connect to {model} after {max_retries} attempts. This preview model may be experiencing issues. You can try again in a few moments.",
                            "is_system_message": True,
                            "is_error": True
                        }), connection_id)
                    
                    # Pass model name to error handler
                    return await handle_session_initialization_error(e, connection_id, safe_send_fn, api_error_handler, model)
        
        # If we get here, all retries failed
        return None
            
    except Exception as e:
        # Pass the api_error_handler instance and model name
        return await handle_session_initialization_error(e, connection_id, safe_send_fn, api_error_handler, model)
