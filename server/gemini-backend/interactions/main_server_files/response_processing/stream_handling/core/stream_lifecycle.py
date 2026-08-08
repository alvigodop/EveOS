import asyncio
import json
import websockets
from .stream_error_logic import StreamErrorHandler
from ..response_parser import _receive_responses
from ...response_handler import GeminiResponseHandler
from ....api_configuration.gemini_config import MODEL, TimeoutConfig, usage_monitor
from ....error_handling.api_error_handler import api_error_handler
from ....server_initialization.reconnection_handler import reconnect_to_gemini
from ....status_monitoring.api_usage_monitor import api_usage_tracker

class StreamSession:
    """
    Manages the lifecycle of the Gemini response stream.
    """
    def __init__(self, session, websocket, connection_monitor, connection_id, audio_processor, voice_name, client, initialize_gemini_session, response_timeout=None, inline_transcription_mode=False, session_role="interactive"):
        self.session = session
        self.websocket = websocket
        self.connection_monitor = connection_monitor
        self.connection_id = connection_id
        self.audio_processor = audio_processor
        self.voice_name = voice_name
        self.client = client
        self.initialize_gemini_session = initialize_gemini_session
        self.response_timeout = response_timeout
        self.inline_transcription_mode = inline_transcription_mode
        self.session_role = session_role
        
        self.error_handler = StreamErrorHandler(connection_id)
        self.response_handler = GeminiResponseHandler(
            connection_monitor,
            audio_processor,
            inline_transcription_mode=inline_transcription_mode,
            session_role=session_role,
        )
        self.retry_attempt = 0

    async def run(self):
        """
        Execute the main response receiving loop.
        """
        # Track this request in the API usage monitor
        request_index = api_usage_tracker.log_request_start(str(self.connection_id), "chat_response")
        request_start_time = asyncio.get_event_loop().time()
        
        receive_task = None
        
        try:
            print(f"Starting persistent response handler for connection {self.connection_id}")
            
            while True:
                if not self.connection_monitor.is_websocket_open():
                    print(f"Connection {self.connection_id} closed, stopping response handler")
                    break

                try:
                    # Use configurable timeout based on retry attempt
                    base_timeout = self.response_timeout if self.response_timeout is not None else TimeoutConfig.RESPONSE_TIMEOUT
                    current_timeout = base_timeout if self.response_timeout is not None else TimeoutConfig.get_response_timeout(self.retry_attempt)

                    print(f"Waiting for Gemini response watchdog (timeout: {current_timeout}s, attempt {self.retry_attempt + 1})...")
                    usage_monitor.increment_request()

                    # Start the response receiving task
                    receive_task = asyncio.create_task(_receive_responses(self.session, self.response_handler, self.connection_monitor, self.connection_id))

                    while not receive_task.done():
                        try:
                            # Wait for next packet OR timeout
                            # Since _receive_responses is a continuous stream, we use wait_for on the task itself
                            # BUT we want to reset the timeout if it's still running.
                            # Actually, a better way is to have _receive_responses notify us of activity, 
                            # or just recognize that it's a long-running task.
                            # Let's use a simpler watchdog approach:
                            await asyncio.wait_for(asyncio.shield(receive_task), timeout=current_timeout)
                            # If we get here, receive_task completed successfully (turn finished)
                            break 
                        except asyncio.TimeoutError:
                            # If we timed out, check if any audio was received recently
                            import time
                            last_activity = getattr(self.response_handler, 'last_audio_time', 0)
                            silence_duration = time.time() - last_activity if last_activity else 999
                            
                            if silence_duration < (current_timeout * 0.8):
                                # We are still getting audio, just not the end of the turn.
                                # Continue waiting - reset the watchdog.
                                print(f"Watchdog reset for connection {self.connection_id} (active audio streaming)")
                                continue
                            else:
                                # True silence/timeout
                                print(f"Watchdog timeout for connection {self.connection_id} (silence: {silence_duration:.1f}s)")
                                receive_task.cancel()
                                await self._handle_idle_timeout(current_timeout)
                                break

                    if receive_task.done() and not receive_task.cancelled():
                        # Check result of receive task
                        try:
                            await receive_task
                            await self._handle_success()
                            continue
                        except websockets.exceptions.ConnectionClosedOK:
                            print(f"Connection {self.connection_id} closed normally")
                            break
                        except websockets.exceptions.ConnectionClosed as e:
                            # Handle connection closures (deadlines etc)
                             should_break = await self._handle_connection_closed(e)
                             if should_break:
                                 break
                        except asyncio.CancelledError:
                            print(f"Response receiving task cancelled")
                            break
                        except Exception as e:
                            # Handle other errors
                            should_break = await self._handle_generic_error(e)
                            if should_break:
                                break
                            
                except Exception as e:
                    should_break = await self._handle_outer_loop_error(e)
                    if should_break:
                        break
                        
        except Exception as e:
            print(f"Critical error in receive_from_gemini: {e}")
            if self.connection_monitor.is_websocket_open():
                await self.connection_monitor.safe_send(json.dumps({
                    "text": f"Critical connection error: {str(e)}",
                    "is_system_message": True,
                    "is_error": True
                }))
        finally:
            self._cleanup(request_index, request_start_time, receive_task)

    async def _handle_idle_timeout(self, current_timeout):
        # Check if we have accumulated audio data that needs processing
        if hasattr(self.audio_processor, 'audio_data') and len(self.audio_processor.audio_data) > 0:
            print(f"Processing accumulated audio data on keepalive: {len(self.audio_processor.audio_data)} bytes")
            try:
                await self.response_handler.handle_turn_complete()
            except Exception as e:
                print(f"Error processing accumulated audio on keepalive: {e}")
        
        self.error_handler.reset()

    async def _handle_success(self):
        print(f"Response receiving completed normally for connection {self.connection_id}")
        self.error_handler.reset()
        self.retry_attempt = 0
        print(f"Turn completed successfully, continuing session for connection {self.connection_id}")

    async def _handle_connection_closed(self, e):
        print(f"Connection {self.connection_id} closed: {e}")
        error_msg = str(e)
        
        if "deadline expired before operation could complete" in error_msg.lower() or e.code == 1011:
            should_retry, handler_msg = await self.error_handler.handle_deadline_error(e)
            
            if should_retry:
                return await self._attempt_reconnect(handler_msg, error_type="deadline")
            else:
                await self._notify_stop(f"Backend connection unstable: {handler_msg}")
                return True
        return True

    async def _handle_generic_error(self, e):
        should_retry, error_msg = await self.error_handler.handle_general_error(e)
        
        if should_retry:
            print(f"Response Status: {error_msg}")
            if self.connection_monitor.is_websocket_open():
                await self.connection_monitor.safe_send(json.dumps({
                    "text": f"Retrying after error (attempt {self.error_handler.consecutive_errors}/{self.error_handler.max_consecutive_errors}): {error_msg}",
                    "is_system_message": True
                }))
            self.retry_attempt += 1
            return False # Continue loop
        else:
            await self._notify_stop(f"Connection error: {error_msg}")
            return True # Break loop

    async def _handle_outer_loop_error(self, e):
        # Similar to generic error but updates counters slightly differently in original code
        # In original code it goes to same api_error_handler
        # I'll reuse the general error handler logic for consistency, 
        # but note that the original code treated this as "connection_error" in usage tracker
        
        self.error_handler.consecutive_errors += 1
        print(f"Error in receive_from_gemini loop (consecutive: {self.error_handler.consecutive_errors}/{self.error_handler.max_consecutive_errors}): {e}")
        
        api_usage_tracker.log_error(str(self.connection_id), "connection_error", str(e), is_deadline_error=False)
        
        should_retry, error_msg = await api_error_handler.handle_api_error(e, self.connection_id, MODEL)
        
        if should_retry and self.error_handler.consecutive_errors < self.error_handler.max_consecutive_errors:
             print(f"Connection Status: {error_msg}")
             if self.connection_monitor.is_websocket_open():
                 await self.connection_monitor.safe_send(json.dumps({
                     "text": f"Retrying connection (attempt {self.error_handler.consecutive_errors}/{self.error_handler.max_consecutive_errors}): {error_msg}",
                     "is_system_message": True
                 }))
             self.retry_attempt += 1
             return False
        else:
             await self._notify_stop(f"Connection failed after {self.error_handler.consecutive_errors} attempts: {error_msg}")
             return True

    async def _attempt_reconnect(self, handler_msg, error_type="deadline"):
        if self.session_role == "world_book_narration":
            await self._notify_stop("Narration transport closed. World Book will reconnect when playback resumes.")
            return True
        print(f"Connection Status: {handler_msg}")
        if self.connection_monitor.is_websocket_open():
            await self.connection_monitor.safe_send(json.dumps({
                "text": f"Backend experiencing delays. {handler_msg}. Reconnecting...",
                "is_system_message": True
            }))
        
        print(f"Attempting to refresh session for connection {self.connection_id}...")
        new_session = await reconnect_to_gemini(
            self.client, 
            self.voice_name, 
            self.websocket, 
            self.connection_monitor.safe_send, 
            self.connection_id, 
            self.initialize_gemini_session
        )
        
        if new_session:
            self.session = new_session
            print(f"Session successfully refreshed for connection {self.connection_id}")
            self.retry_attempt += 1
            return False # Continue loop
        else:
            print(f"Reconnection failed for connection {self.connection_id}")
            await self._notify_stop("Unable to re-establish connection to Gemini backend.")
            return True # Break loop

    async def _notify_stop(self, message):
        if self.connection_monitor.is_websocket_open():
            await self.connection_monitor.safe_send(json.dumps({
                "text": message,
                "is_system_message": True,
                "is_error": True
            }))

    def _cleanup(self, request_index, request_start_time, receive_task):
        # Log final usage statistics
        stats = usage_monitor.get_stats()
        print(f"\nConnection {self.connection_id} usage statistics:")
        print(f"  Requests: {stats['requests']}")
        print(f"  Errors: {stats['errors']} (rate: {stats['error_rate']:.2%})")
        print(f"  Deadline errors: {stats['deadline_errors']} (rate: {stats['deadline_error_rate']:.2%})")
        
        # Track request completion in API usage monitor
        if request_start_time:
            response_time = asyncio.get_event_loop().time() - request_start_time
            success = self.error_handler.consecutive_errors == 0 and self.error_handler.deadline_consecutive_errors == 0
            api_usage_tracker.log_request_completion(request_index, success, response_time)
        
        # Cancel any remaining tasks
        if receive_task and not receive_task.done():
            receive_task.cancel()
            try:
                # We can't await here easily if we are in finally block which might care about return? 
                # Actually finally block await is fine in async func.
                # But we should be careful about suppressing other errors.
                # Just schedule it or create a task? No, best to just cancel.
                pass 
            except Exception as e:
                print(f"Error during final task cleanup: {e}")
        
        print(f"Persistent response handler for connection {self.connection_id} terminated")
