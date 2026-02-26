import asyncio
import traceback
import threading
from functools import partial

# Use absolute imports from main_server_files to avoid potential relative import issues
from main_server_files.api_configuration.api_client_manager import setup_api_environment
from main_server_files.server_initialization.server_lifecycle_manager import manage_server_lifecycle, cleanup_server
from main_server_files.server_initialization.server_config import CLEANUP_INTERVAL_SEC, DEFAULT_PORT, STATUS_PORT
from main_server_files.websocket_server.gemini_session_handler import gemini_session_handler
from main_server_files.session_management.session_manager import (
    MAIN_MODEL_SESSION_LIMIT,
    periodic_cleanup,
    cleanup_resources,
    get_active_sessions
)
from main_server_files.status_monitoring.status_handler import start_status_server
from main_server_files.status_monitoring.api_usage_monitor import start_monitoring_service
from main_server_files.port_management.port_handler import is_port_in_use, free_port

async def initialize_main_server():
    try:
        # Initialize API and get client
        client = setup_api_environment()
        
        # Free the WebSocket port if it's in use
        if is_port_in_use(DEFAULT_PORT):
            print(f"\nWebSocket port {DEFAULT_PORT} is in use. Attempting to free it...")
            free_port(DEFAULT_PORT)
            await asyncio.sleep(2)  # Wait for port to be fully freed
            
        # Free the status server port if it's in use
        if is_port_in_use(STATUS_PORT):
            print(f"\nStatus server port {STATUS_PORT} is in use. Attempting to free it...")
            free_port(STATUS_PORT)
            await asyncio.sleep(2)  # Wait for port to be fully freed
        
        # Start the status monitoring server in a separate thread
        status_server = start_status_server(STATUS_PORT)
        status_thread = threading.Thread(
            target=status_server.serve_forever,
            daemon=True  # This ensures the thread will be killed when the main program exits
        )
        status_thread.start()
        
        # Create a partial function with the client parameter
        handler = partial(gemini_session_handler, client=client)
        
        # Start periodic cleanup
        asyncio.create_task(periodic_cleanup(CLEANUP_INTERVAL_SEC))
        
        # Start API usage monitoring service
        print("Starting API usage monitoring service...")
        asyncio.create_task(start_monitoring_service(get_active_sessions()))

        # Use the server lifecycle manager (This blocks until server stops)
        server, cleanup_task = await manage_server_lifecycle(
            handler,
            cleanup_interval_sec=CLEANUP_INTERVAL_SEC
        )
        
        return server, cleanup_task, status_server
    finally:
        if 'server' in locals() and server:
            await cleanup_server(server)
            await cleanup_resources()
        if 'status_server' in locals() and status_server:
            status_server.shutdown()
            status_server.server_close()

def run_main_server():
    try:
        print(f"Maximum concurrent sessions: {MAIN_MODEL_SESSION_LIMIT}")
        
        # Run the main async function
        asyncio.run(initialize_main_server())
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"\n====== FATAL ERROR ======")
        print(f"Error details: {e}")
        print(f"Error type: {type(e).__name__}")
        traceback.print_exc()
    finally:
        print("\nServer process terminated") 