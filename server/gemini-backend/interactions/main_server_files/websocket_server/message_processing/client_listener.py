import json
import asyncio
import traceback
import time
import websockets
from .message_router import route_message
from .session_reinitializer import reinitialize_session

async def listen_for_messages(session, websocket, connection_monitor, connection_id, audio_processor, client=None):
    """
    Main loop that listens for messages from the client API and routes them.
    Manages retries and session reinitialization.
    """
    retry_count = 0
    max_retries = 3
    
    # We need to keep track of the current session as it might change during reinitialization
    current_session = session
    
    while retry_count < max_retries:
        try:
            while True:  # Add outer loop for reinitialization
                try:
                    async for message in websocket:
                        try:
                            # Record activity for any message received from the client
                            connection_monitor.record_activity()
                            data = json.loads(message)
                            
                            await route_message(
                                data, 
                                current_session, 
                                connection_monitor, 
                                audio_processor, 
                                connection_id
                            )

                        except json.JSONDecodeError as e:
                            print(f"ERROR: Failed to decode client message: {e}. Raw message: {message[:500]}...")
                            # Send JSON error response to client
                            try:
                                error_response = {
                                    "type": "json_error",
                                    "message": "Invalid JSON format",
                                    "error": str(e),
                                    "timestamp": time.time()
                                }
                                await connection_monitor.safe_send(json.dumps(error_response))
                            except Exception as error_send_error:
                                print(f"Could not send JSON error response: {error_send_error}")
                            
                        except Exception as e:
                            print(f"ERROR: Unhandled exception in message processing loop: {e}")
                            traceback.print_exc()
                            
                            # Send general error response to client
                            try:
                                error_response = {
                                    "type": "processing_error",
                                    "message": "Internal processing error",
                                    "error": str(e),
                                    "timestamp": time.time()
                                }
                                await connection_monitor.safe_send(json.dumps(error_response))
                            except Exception as error_send_error:
                                print(f"Could not send error response: {error_send_error}")
                            
                            await asyncio.sleep(1)  # Brief pause to prevent overwhelming on repeated errors
                    
                    # When the message loop ends naturally, try to reinitialize
                    new_session = await reinitialize_session(websocket, client, connection_monitor, connection_id)
                    
                    if new_session:
                        current_session = new_session
                        retry_count = 0 # Reset retry count on successful reinitialization
                        continue
                    else:
                        print(f"Session ended for connection {connection_id}")
                        return # Exit the function if reinitialization failed or wasn't needed
                        
                except websockets.exceptions.ConnectionClosed as e:
                    print(f"Client connection {connection_id} closed: {e.code} - {e.reason}")
                    return
                except Exception as e:
                    print(f"ERROR: Unhandled exception in outer message loop: {e}")
                    traceback.print_exc()
                    raise # Raise to trigger the outer retry logic with backoff
                
        except Exception as e:
            print(f"ERROR: Unhandled exception in send_to_gemini task (retry loop level): {e}")
            traceback.print_exc()
            retry_count += 1
            if retry_count >= max_retries:
                print(f"ERROR: Failed after {max_retries} retries in send_to_gemini. Aborting task.")
                break
            else:
                print(f"Retrying send_to_gemini task (attempt {retry_count}/{max_retries})...")
                await asyncio.sleep(2 ** retry_count)
                
    print(f"listen_for_messages task ended for connection: {connection_id}")
