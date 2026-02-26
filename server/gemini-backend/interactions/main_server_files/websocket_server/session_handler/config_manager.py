import asyncio
import json
import datetime
from ...chat_history.chat_history_handler import load_chat_history, clear_chat_history
from ...voice_configuration.voice_config_handler import extract_voice_configuration
from ...session_management.session_manager import active_sessions

async def handle_initial_config(websocket, connection_monitor, error_handler, connection_id):
    """
    Handles the initial configuration handshake, including history commands and voice config.
    Returns (voice_name, config_data) tuple or (None, None) on error.
    """
    try:
        config_message = await asyncio.wait_for(websocket.recv(), timeout=30)
        config_data = json.loads(config_message)
        print(f"Configuration received for connection: {connection_id}")
        
        # Check if this is a clear history command
        if config_data.get("command") == "clear_history":
            print("Received clear_history command at session start")
            clear_chat_history()
            await connection_monitor.safe_send(json.dumps({
                "text": "Chat history cleared",
                "is_system_message": True
            }))
            # Get the next message which should be the configuration
            config_message = await asyncio.wait_for(websocket.recv(), timeout=30)
            config_data = json.loads(config_message)
            print("Configuration received after history clear")
        
        # Check if we received realtime_input instead of configuration (Race condition mitigation)
        if "realtime_input" in config_data:
            print("WARNING: Received realtime_input as initial message! configuration/system instructions will be missing.")
            # We can't use this as config, but we can't easily push it back.
            # We will proceed with default configuration.
            # Ideally, we should stash this input to be processed later, but session_loop expects config first.
            # For now, we return empty config (which leads to defaults) but we LOSE this first input message 
            # unless we modify the return signature to pass it back.
            # However, simpler fix is just to let session_loop run with defaults, 
            # AND the user will likely retry their input.
            
            # TODO: Improve this by allowing `handle_initial_config` to return an "initial_message" payload 
            # that session_loop can process immediately after connecting.
            pass
        
        # Check if this is a get_history command
        if config_data.get("command") == "get_history":
            print("Received get_history command at session start")
            chat_history = load_chat_history()
            
            if chat_history:
                await connection_monitor.safe_send(json.dumps({
                    "text": "Restoring chat history...",
                    "is_system_message": True
                }))
                
                for msg in chat_history:
                    # Format the timestamp
                    timestamp = ""
                    try:
                        # Parse the ISO timestamp and format it
                        dt = datetime.datetime.fromisoformat(msg['timestamp'])
                        timestamp = dt.strftime("%m/%d/%Y %I:%M %p")
                    except Exception as e:
                        print(f"Error formatting timestamp: {e}")
                        
                    prefix = "YOU: " if msg['role'] == 'user' else "GEMINI: "
                    await connection_monitor.safe_send(json.dumps({
                        "text": f"{prefix}{msg['content']}",
                        "timestamp": timestamp,
                        "is_history": True
                    }))
                    await asyncio.sleep(0.1)
            else:
                await connection_monitor.safe_send(json.dumps({
                    "text": "No chat history found",
                    "is_system_message": True
                }))
            
            # Get the next message which should be the configuration
            config_message = await asyncio.wait_for(websocket.recv(), timeout=30)
            config_data = json.loads(config_message)
            print("Configuration received after history request")
        
        # Check if this is a voice change command / close session
        if config_data.get("command") == "close_session":
            print("Received close session command - waiting for new voice config")
            try:
                # Add timeout for receiving the next message
                config_message = await asyncio.wait_for(websocket.recv(), timeout=10)
                config_data = json.loads(config_message)
                print("New voice configuration received")
                
                # Send acknowledgment to client
                await connection_monitor.safe_send(json.dumps({
                    "text": "Voice change request received, applying new voice configuration...",
                    "is_system_message": True
                }))
                
                # If we have an active session, close it properly
                if connection_id in active_sessions and active_sessions[connection_id].get("session"):
                    try:
                        print(f"Closing existing session for connection {connection_id} to change voice")
                        # We don't need to actually close anything since we'll create a new session
                    except Exception as e:
                        await error_handler.handle_session_close_error(e)
                
                # Remove from active sessions to prepare for new session
                if connection_id in active_sessions:
                    del active_sessions[connection_id]
                    print(f"Removed connection {connection_id} from active sessions for voice change")
            except asyncio.TimeoutError:
                await error_handler.handle_voice_config_timeout()
                return None, None
            except Exception as e:
                await error_handler.handle_voice_change_error(e)
                return None, None
        
        # Extract voice configuration
        voice_name = extract_voice_configuration(config_data)
        return voice_name, config_data
        
    except Exception as e:
        print(f"Error handling initial configuration: {e}")
        # In a real error scenario, we might want to propagate this or handle it with error_handler
        return None, None
