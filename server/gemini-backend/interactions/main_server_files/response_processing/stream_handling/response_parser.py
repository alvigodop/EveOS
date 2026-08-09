import logging
import asyncio
import websockets
import json
import time
from ...api_configuration.gemini_config import usage_monitor
from ...status_monitoring.api_usage_monitor import api_usage_tracker

# Configure logging for raw response data
response_logger = logging.getLogger('gemini_responses')


def _usage_value(metadata, *names):
    for name in names:
        value = getattr(metadata, name, None)
        if value is not None:
            return int(value or 0)
    return 0


def _usage_payload(metadata):
    prompt = _usage_value(metadata, "prompt_token_count")
    cached = _usage_value(metadata, "cached_content_token_count")
    output = _usage_value(metadata, "response_token_count", "candidates_token_count")
    tool = _usage_value(metadata, "tool_use_prompt_token_count")
    thoughts = _usage_value(metadata, "thoughts_token_count")
    total = _usage_value(metadata, "total_token_count") or (prompt + output + tool + thoughts)
    return {
        "prompt": prompt,
        "cached": cached,
        "output": output,
        "tool": tool,
        "thoughts": thoughts,
        "total": total,
    }


def _merge_transcript(current, incoming):
    chunk = str(incoming or "").strip()
    if not chunk:
        return current
    if not current or chunk.startswith(current):
        return chunk
    if current.endswith(chunk):
        return current
    return f"{current} {chunk}".strip()

async def _receive_responses(session, response_handler, connection_monitor, connection_id):
    """Helper function to handle receiving responses from Gemini session with enhanced error resilience and persistent session support"""
    turn_id = f"{connection_id}:{time.time_ns()}"
    output_transcription = ""

    async def finish_turn():
        if output_transcription:
            await response_handler.process_transcription_response(output_transcription)
        await response_handler.handle_turn_complete()

    try:
        async for response in session.receive():
            # Check if connection is still active before processing
            if not connection_monitor.is_websocket_open():
                print(f"Connection {connection_id} closed during response processing")
                break

            usage_metadata = getattr(response, "usage_metadata", None)
            if usage_metadata is not None:
                usage = _usage_payload(usage_metadata)
                await connection_monitor.safe_send(json.dumps({
                    "type": "live_usage",
                    "turnId": turn_id,
                    "model": getattr(connection_monitor, "model_name", ""),
                    "usage": usage,
                }))

            # Log raw response structure for debugging
            try:
                response_logger.debug(f"Raw response structure for {connection_id}: {response}")
                if hasattr(response, 'server_content') and response.server_content:
                    response_logger.debug(f"Server content attributes: {dir(response.server_content)}")
            except Exception as e:
                response_logger.warning(f"Could not log raw response: {e}")

            # Enhanced response parsing with defensive programming
            try:
                # Check if response has server_content with defensive checks
                server_content = getattr(response, 'server_content', None)
                if server_content is None:
                    response_logger.debug(f"Metadata-only response for connection {connection_id}")
                    continue

                native_transcription = getattr(server_content, "output_transcription", None)
                if native_transcription is not None:
                    output_transcription = _merge_transcript(
                        output_transcription,
                        getattr(native_transcription, "text", ""),
                    )

                # Process model_turn content if available
                model_turn = getattr(server_content, 'model_turn', None)
                if model_turn is not None:
                    # Process response parts if they exist
                    parts = getattr(model_turn, 'parts', None)
                    if parts:
                        for part in parts:
                            await response_handler.process_response_part(part)
                    else:
                        print(f"No parts found in model_turn for connection {connection_id}")

                # Check for turn completion (based on Live API documentation)
                # We check this AFTER processing model_turn parts to ensure final audio is processed
                turn_complete = getattr(server_content, 'turn_complete', None)
                if turn_complete is not None and turn_complete:
                    print(f"Turn complete (explicit turn_complete) for connection {connection_id}")
                    await finish_turn()
                    return # Turn finished, return to session loop
                
                # Check for other completion indicators in model_turn
                if model_turn is not None:
                    # Fallback: Check for legacy completion indicators
                    final_attr = getattr(model_turn, 'final', None)
                    if final_attr is not None and final_attr:
                        print(f"Turn complete (legacy final=True) for connection {connection_id}")
                        await finish_turn()
                        return

                    # Fallback: Check for other completion indicators
                    is_finished = getattr(model_turn, 'finished', None)
                    is_complete = getattr(model_turn, 'complete', None)
                    if is_finished or is_complete:
                        print(f"Turn complete (finished={is_finished}, complete={is_complete}) for connection {connection_id}")
                        await finish_turn()
                        return
                else:
                    print(f"Non-model_turn content received for connection {connection_id}")

                # Final fallback: Check for audio completion based on timing and content
                completed = await response_handler.check_audio_completion()
                if not completed:
                    # Only log this as debug info, not as an error
                    response_logger.debug(f"No turn completion detected for connection {connection_id}")
                    # Log available attributes for debugging
                    try:
                        server_content_attrs = [attr for attr in dir(server_content) if not attr.startswith('_')]
                        response_logger.debug(f"Available server_content attributes: {server_content_attrs}")
                        if model_turn:
                            model_turn_attrs = [attr for attr in dir(model_turn) if not attr.startswith('_')]
                            response_logger.debug(f"Available model_turn attributes: {model_turn_attrs}")
                    except Exception as e:
                        response_logger.warning(f"Could not log response attributes: {e}")
                                
            except AttributeError as e:
                print(f"AttributeError in response parsing for connection {connection_id}: {e}")
                response_logger.warning(f"Response structure error for {connection_id}: {e}")
                # Defensive fallback: try to complete any pending audio
                try:
                    await response_handler.check_audio_completion()
                except Exception as fallback_error:
                    print(f"Fallback audio completion failed: {fallback_error}")
            except Exception as e:
                print(f"Unexpected error in response parsing for connection {connection_id}: {e}")
                response_logger.error(f"Response parsing error for {connection_id}: {e}")
                # Try to handle any pending audio before continuing
                try:
                    await response_handler.check_audio_completion()
                except Exception as fallback_error:
                    print(f"Fallback audio completion failed: {fallback_error}")
                
    except websockets.exceptions.ConnectionClosedOK:
        # This is a normal connection closure (code 1000), not an error
        print(f"Connection {connection_id} closed normally during response receiving")
    except websockets.exceptions.ConnectionClosed as e:
        # Handle deadline errors and other connection closures through the API error handler
        error_msg = str(e)
        print(f"Connection {connection_id} closed during response receiving: {e}")
        
        # Track this as an error in usage monitoring
        usage_monitor.increment_error()
        
        # Check if this is a deadline error and handle it properly
        if "deadline expired before operation could complete" in error_msg.lower() or e.code == 1011:
            # Track deadline errors specifically
            usage_monitor.increment_deadline_error()
            # This is a deadline error - raise it so the outer handler can process it through the API error handler
            raise Exception(f"Deadline expired error: {error_msg}")
        else:
            # For other connection closures, just re-raise
            raise
    except asyncio.CancelledError:
        print(f"Response receiving task cancelled for connection {connection_id}")
        raise  # Re-raise so the task is properly cancelled
    except Exception as e:
        print(f"Error in _receive_responses for connection {connection_id}: {e}")
        usage_monitor.increment_error()
        
        # Send error message to client if possible
        if connection_monitor.is_websocket_open():
            await connection_monitor.safe_send(json.dumps({
                "text": f"Error receiving response: {str(e)}",
                "is_system_message": True,
                "is_error": True
            }))
        # Re-raise the exception so it can be handled by the outer error handler
        raise
