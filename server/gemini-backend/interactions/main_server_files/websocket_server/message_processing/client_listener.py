import asyncio
import json
import time
import traceback

import websockets

from .message_router import route_message


async def listen_for_messages(
    session,
    websocket,
    connection_monitor,
    connection_id,
    audio_processor,
    client=None,
):
    """Route browser messages into one lifetime-bound Gemini Live session."""
    try:
        async for message in websocket:
            try:
                connection_monitor.record_activity()
                data = json.loads(message)
                await route_message(
                    data,
                    session,
                    connection_monitor,
                    audio_processor,
                    connection_id,
                    client,
                )
            except json.JSONDecodeError as error:
                print(
                    "ERROR: Failed to decode client message: "
                    f"{error}. Raw message: {message[:500]}..."
                )
                try:
                    await connection_monitor.safe_send(json.dumps({
                        "type": "json_error",
                        "message": "Invalid JSON format",
                        "error": str(error),
                        "timestamp": time.time(),
                    }))
                except Exception as send_error:
                    print(f"Could not send JSON error response: {send_error}")
            except Exception as error:
                print(f"ERROR: Unhandled exception in message processing loop: {error}")
                traceback.print_exc()
                try:
                    await connection_monitor.safe_send(json.dumps({
                        "type": "processing_error",
                        "message": "Internal processing error",
                        "error": str(error),
                        "timestamp": time.time(),
                    }))
                except Exception as send_error:
                    print(f"Could not send error response: {send_error}")
                await asyncio.sleep(1)
    except websockets.exceptions.ConnectionClosed as error:
        print(
            f"Client connection {connection_id} closed: "
            f"{error.code} - {error.reason}"
        )
    except Exception as error:
        print(f"ERROR: Unhandled exception in send_to_gemini task: {error}")
        traceback.print_exc()
        raise

    print(f"listen_for_messages task ended for connection: {connection_id}")
