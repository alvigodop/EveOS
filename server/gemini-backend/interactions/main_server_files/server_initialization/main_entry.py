import asyncio
import traceback
import threading
from functools import partial

# Use absolute imports from main_server_files to avoid potential relative import issues
from main_server_files.api_configuration.api_client_manager import setup_api_environment
from main_server_files.server_initialization.server_lifecycle_manager import manage_server_lifecycle, cleanup_server
from main_server_files.server_initialization.server_config import CLEANUP_INTERVAL_SEC, DEFAULT_PORT
from main_server_files.server_initialization.server_initializer import parse_server_port, validate_server_port
from main_server_files.websocket_server.gemini_session_handler import gemini_session_handler
from main_server_files.session_management.session_manager import (
    MAIN_MODEL_SESSION_LIMIT,
    cleanup_resources,
    get_active_sessions
)
from main_server_files.status_monitoring.status_handler import start_status_server
from main_server_files.status_monitoring.api_usage_monitor import start_monitoring_service

async def initialize_main_server(port=DEFAULT_PORT):
    try:
        port = validate_server_port(port)
        # Initialize API and get client
        client = setup_api_environment()
        status_port = int(port) + 1
        
        # Start the status monitoring server in a separate thread
        status_server = start_status_server(status_port, websocket_port=port)
        status_thread = threading.Thread(
            target=status_server.serve_forever,
            daemon=True  # This ensures the thread will be killed when the main program exits
        )
        status_thread.start()
        
        # Create a partial function with the client parameter
        handler = partial(gemini_session_handler, client=client)
        
        # Start API usage monitoring service
        print("Starting API usage monitoring service...")
        asyncio.create_task(start_monitoring_service(get_active_sessions()))

        # Use the server lifecycle manager (This blocks until server stops)
        server, cleanup_task = await manage_server_lifecycle(
            handler,
            cleanup_interval_sec=CLEANUP_INTERVAL_SEC,
            port=port
        )
        
        return server, cleanup_task, status_server
    finally:
        if 'server' in locals() and server:
            await cleanup_server(server)
            await cleanup_resources()
        if 'status_server' in locals() and status_server:
            status_server.shutdown()
            status_server.server_close()

def run_main_server(argv=None):
    try:
        print(f"Maximum concurrent sessions: {MAIN_MODEL_SESSION_LIMIT}")
        
        port = parse_server_port(argv)
        asyncio.run(initialize_main_server(port))
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"\n====== FATAL ERROR ======")
        print(f"Error details: {e}")
        print(f"Error type: {type(e).__name__}")
        traceback.print_exc()
    finally:
        print("\nServer process terminated")
