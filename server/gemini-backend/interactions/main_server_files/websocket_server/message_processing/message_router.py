import json
import time
from ...media_processing.realtime_input_processor import process_realtime_input
from ...command_processing.command_handler import process_command

async def route_message(data, session, connection_monitor, audio_processor, connection_id, client=None):
    """
    Routes a parsed message to the appropriate handler based on its content/type.
    """
    # *** SETUP & CONFIGURATION MESSAGES ***
    if "setup" in data:
        # Client setup/configuration messages - these are initialization messages
        print("Received client setup configuration message")
        # Setup messages are handled by session initialization and don't need realtime processing
        # Send acknowledgment if needed
        try:
            setup_ack = {
                "type": "setup_acknowledgment",
                "message": "Setup configuration received",
                "timestamp": time.time()
            }
            await connection_monitor.safe_send(json.dumps(setup_ack))
        except Exception as ack_error:
            print(f"Warning: Could not send setup acknowledgment: {ack_error}")
        return True

    # *** TYPED MESSAGE HANDLING ***
    elif "type" in data:
        message_type = data.get("type")
        
        # *** COMPREHENSIVE PING/PONG HANDLING ***
        if message_type in ["application_ping", "ping", "keepalive", "heartbeat"]:
            print(f"Received {message_type} from client, sending pong response")
            # *** RESTORED APPLICATION-LEVEL PING HANDLER ***
            pong_response = {
                "type": "application_pong",
                "message": "pong",
                "timestamp": data.get("timestamp"),
                "server_timestamp": time.time(),
                "client_id": connection_id
            }
            await connection_monitor.safe_send(json.dumps(pong_response))
            return True

        # *** MODE 2: TEXT-BRAIN RELAY (additive; does not touch the live audio loop) ***
        elif message_type == "text_brain_request":
            print("Received Mode 2 text_brain_request")
            from ...text_brain.text_brain_handler import handle_text_brain_request
            request_client = client or getattr(audio_processor, "client", None)
            await handle_text_brain_request(data, connection_monitor, request_client)
            return True

        # *** COMMAND MESSAGE HANDLING ***
        elif message_type in ["command", "action", "request"]:
            print(f"Processing typed command: {data.get('command', data.get('action', 'unknown'))}")
            await process_command(data, connection_monitor, audio_processor, connection_id)
            return True
            
        # *** STATUS AND MONITORING MESSAGES ***
        elif message_type in ["status_update", "client_status", "connection_test"]:
            print(f"Received client status message: {message_type}")
            # Send status acknowledgment
            status_response = {
                "type": "status_acknowledgment",
                "received_type": message_type,
                "server_status": "active",
                "timestamp": time.time()
            }
            await connection_monitor.safe_send(json.dumps(status_response))
            return True
            
        # *** CONFIGURATION MESSAGES ***
        elif message_type in ["config", "settings", "preferences"]:
            print(f"Received configuration message: {message_type}")
            # Handle configuration updates
            await process_command(data, connection_monitor, audio_processor, connection_id)
            return True
            
        else:
            print(f"Received typed message with unrecognized type: {message_type}")
            # Try to process as command anyway as fallback
            try:
                await process_command(data, connection_monitor, audio_processor, connection_id)
            except Exception as fallback_error:
                print(f"Fallback processing failed for typed message: {fallback_error}")
            return True
    
    # *** REALTIME INPUT PROCESSING ***
    elif "realtime_input" in data:
        # This is genuine realtime input data for the AI model
        await process_realtime_input(data, session, connection_monitor, audio_processor)
        return True
    
    # *** LEGACY COMMAND PROCESSING ***
    elif any(key in data for key in ["command", "clear_history", "voice_change", "get_history", "new_model", "action"]):
        # Legacy command format - maintain backward compatibility
        print(f"Processing legacy command: {data.get('command', data.get('action', 'legacy_command'))}")
        await process_command(data, connection_monitor, audio_processor, connection_id)
        return True
    
    # *** LEGACY PING HANDLING FOR BACKWARD COMPATIBILITY ***
    elif data.get("ping") == True or data.get("ping") == "ping":
        print("Received legacy ping format from client, sending pong")
        await connection_monitor.safe_send(json.dumps({
            "pong": True,
            "timestamp": time.time(),
            "server_time": time.time()
        }))
        return True
    
    # *** SILENT TIME & STATUS UPDATES ***
    elif data.get("is_time_update") and data.get("is_silent_update"):
        # Silent time updates don't need processing or logging
        return True
    elif data.get("is_silent_update") or data.get("silent"):
        # Other silent updates
        return True
    
    # *** CHAT HISTORY AND CONTEXT MESSAGES ***
    elif any(key in data for key in ["history", "context", "conversation_history", "chat_context"]):
        print("Received chat history/context message")
        await process_command(data, connection_monitor, audio_processor, connection_id)
        return True
    
    # *** MEDIA AND MULTIMODAL MESSAGES ***
    elif any(key in data for key in ["media", "audio", "video", "image", "file"]):
        print("Received media/multimodal message")
        # Route to appropriate media processing
        try:
            await process_realtime_input(data, session, connection_monitor, audio_processor)
        except Exception as media_error:
            print(f"Media processing failed, trying command processing: {media_error}")
            await process_command(data, connection_monitor, audio_processor, connection_id)
        return True
    
    # *** ENHANCED WARNING FOR TRULY UNKNOWN MESSAGES ***
    else:
        # Only warn about genuinely unrecognized message structures
        message_keys = sorted(list(data.keys()))  # Sort for consistent logging
        message_size = len(str(data))
        
        # Check if this looks like a data message we should process anyway
        if len(message_keys) > 0 and message_size > 10:
            print(f"INFO: Processing unrecognized message structure with keys: {message_keys}")
            # Preview first part of message for debugging (but limit size)
            message_preview = str(data)[:100] + ("..." if len(str(data)) > 100 else "")
            print(f"Message preview: {message_preview}")
            
            # Try to process as command with enhanced error handling
            try:
                await process_command(data, connection_monitor, audio_processor, connection_id)
                print("Successfully processed unrecognized message as command")
            except Exception as unknown_error:
                print(f"Could not process unrecognized message: {unknown_error}")
                # Send error response to client
                error_response = {
                    "type": "processing_error",
                    "message": "Message format not recognized",
                    "received_keys": message_keys,
                    "timestamp": time.time()
                }
                await connection_monitor.safe_send(json.dumps(error_response))
        else:
            # Very small or empty messages - likely malformed
            print(f"WARNING: Received malformed or empty message: {data}")
        return True
