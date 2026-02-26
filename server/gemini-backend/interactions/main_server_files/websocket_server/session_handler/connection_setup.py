import asyncio
import json
from ...session_management.session_manager import (
    register_active_session,
    update_session_activity,
    semaphore_acquired,
    session_semaphore,
    cleanup_resources,
    MAIN_MODEL_SESSION_LIMIT
)
from ...audio_processing.audio_processor import AudioProcessor
from ...session_management.connection_monitor import ConnectionMonitor
from ...error_handling.session_error_handler import SessionErrorHandler
from ...error_handling import api_error_handler

def setup_connection_resources(websocket, client, connection_id):
    """
    Initializes the connection monitor, audio processor, and error handler.
    Registers the active session.
    """
    # Register the new session
    register_active_session(connection_id, websocket)
    
    # Create connection monitor first so we can pass its method
    connection_monitor = ConnectionMonitor(
        websocket=websocket,
        connection_id=connection_id,
        update_activity_callback=lambda: update_session_activity(connection_id)
    )

    # Create audio processor instance, passing the ConnectionMonitor's record_activity method
    audio_processor = AudioProcessor(
        websocket,
        connection_id,
        client,
        update_activity_callback=connection_monitor.record_activity # Pass the method directly
    )
    
    # Create error handler instance, passing the imported api_error_handler
    error_handler = SessionErrorHandler(connection_monitor, connection_id, api_error_handler)
    
    return connection_monitor, audio_processor, error_handler

async def acquire_session_slot(connection_monitor, error_handler, connection_id):
    """
    Attempts to acquire a semaphore slot for the session.
    Returns True if successful, False otherwise.
    """
    # Check if we can acquire a session slot
    if not session_semaphore.locked() and session_semaphore._value <= 0:
        await error_handler.handle_session_slot_error("max_reached", MAIN_MODEL_SESSION_LIMIT)
        return False
    
    # Try to acquire the semaphore with a timeout
    try:
        # Wait up to 30 seconds to acquire a session slot
        acquire_timeout = 30
        acquire_success = False
        
        # Send a message to the client that they're in queue
        if connection_monitor.is_websocket_open():
            await connection_monitor.safe_send(json.dumps({
                "text": f"Waiting for an available session slot (timeout: {acquire_timeout}s)...",
                "is_system_message": True
            }))
        else:
            await error_handler.handle_session_slot_error("closed_before_acquire")
            return False
        
        # Try to acquire the semaphore with a timeout
        try:
            acquire_success = await asyncio.wait_for(session_semaphore.acquire(), timeout=acquire_timeout)
            if acquire_success:
                # Track that this connection has acquired a semaphore
                semaphore_acquired.add(connection_id)
        except asyncio.TimeoutError:
            acquire_success = False
        
        if not acquire_success:
            await error_handler.handle_session_slot_error("timeout")
            return False
        
        print(f"Acquired session slot for connection {connection_id}")
        if connection_monitor.is_websocket_open():
            await connection_monitor.safe_send(json.dumps({
                "text": "Session slot acquired. Proceeding with connection...",
                "is_system_message": True
            }))
            return True
        else:
            print(f"Connection {connection_id} closed after acquiring semaphore")
            await cleanup_resources(connection_id)
            return False
    
    except Exception as e:
        await error_handler.handle_session_slot_error("acquire_error")
        return False
