import json
import traceback
import websockets
from ...chat_history.chat_history_handler import load_chat_history
from ...api_configuration.gemini_config import MAIN_MODEL as MODEL
from ...session_management.gemini_session_initializer import initialize_gemini_session

async def reinitialize_session(websocket, client, connection_monitor, connection_id):
    """
    Attempts to reinitialize the Gemini session if the connection is still open.
    Returns the new session if successful, or None otherwise.
    """
    print("WebSocket message loop finished gracefully. Attempting to reinitialize model...")
    
    # Check if the connection is still open before attempting reinitialization
    if websocket.state in (websockets.protocol.State.CLOSED, websockets.protocol.State.CLOSING):
        print("WebSocket is closed, cannot reinitialize")
        return None
        
    try:
        # Build context from chat history
        chat_history = load_chat_history()
        context = []
        for msg in chat_history[-10:]:  # Use last 10 messages for context
            context.append({
                "role": "user" if msg['role'] == 'user' else "model",
                "parts": [{"text": msg['content']}]
            })
        
        # Get the current voice name - defaulting to Aoede as in original code
        # In a more advanced version, this could be passed in or retrieved from session state
        voice_name = "Aoede" 
        
        # Try to reconnect to Gemini API
        await connection_monitor.safe_send(json.dumps({
            "text": "Reinitializing connection...",
            "is_system_message": True
        }))
        
        # Check if we have a client instance for reinitialization
        if not client:
            print("Error: No client instance available for reinitialization")
            await connection_monitor.safe_send(json.dumps({
                "text": "Failed to reinitialize: No client instance available",
                "is_system_message": True,
                "is_error": True
            }))
            return None
        
        new_session = await initialize_gemini_session(
            client=client,
            voice_name=voice_name,
            context=context,
            websocket=websocket,
            safe_send=connection_monitor.safe_send,
            model=MODEL,
            connection_id=connection_id
        )
        
        if new_session:
            print("Successfully reinitialized model")
            await connection_monitor.safe_send(json.dumps({
                "text": "Connection reinitialized successfully",
                "is_system_message": True
            }))
            return new_session
        else:
            print("Failed to reinitialize model")
            await connection_monitor.safe_send(json.dumps({
                "text": "Failed to reinitialize connection",
                "is_system_message": True,
                "is_error": True
            }))
            return None
            
    except Exception as e:
        print(f"Error reinitializing model: {e}")
        traceback.print_exc()
        return None
