import asyncio
import websockets
import sys
import traceback
from ..port_management.port_handler import is_port_in_use, free_port
from ..status_monitoring.status_handler import start_status_server
from ..session_management.session_manager import periodic_cleanup
from ..api_configuration.gemini_config import TimeoutConfig

async def initialize_websocket_server(port, gemini_session_handler, cleanup_interval_sec):
    """
    Initialize and start the WebSocket server with retries and enhanced configuration for deadline error handling.
    Enhanced timeout settings to reduce deadline expired errors and improve connection stability.
    
    Args:
        port (int): The port number to run the server on
        gemini_session_handler (callable): The handler function for WebSocket connections
        cleanup_interval_sec (int): Interval for periodic cleanup
        
    Returns:
        websockets.WebSocketServer: The running WebSocket server instance
    """
    try:
        print(f"\nAttempting to start WebSocket server on port {port}")

        # Check if port is already in use and kill the process if needed
        if is_port_in_use(port):
            print(f"\nPort {port} is already in use. Attempting to free it...")
            if free_port(port):
                print(f"Successfully freed port {port}")
                # Increased delay to ensure the port is fully released
                await asyncio.sleep(3)
            else:
                print(f"Failed to free port {port}. Please close the application using it manually.")
                sys.exit(1)
        
        # Try to start the server with retries
        max_retries = 3
        retry_count = 0
        server = None
        
        while retry_count < max_retries:
            try:
                # Create and start the WebSocket server with enhanced settings for deadline handling
                server = await websockets.serve(
                    gemini_session_handler,
                    "127.0.0.1",  # Loopback only: EveOS is local-first, the browser connects over 127.0.0.1
                    port,
                    ping_interval=30,  # More frequent pings to keep connection alive (was 20)
                    ping_timeout=TimeoutConfig.WEBSOCKET_PING_TIMEOUT,   # Use configurable timeout for backend delays
                    max_size=None,     # No limit on message size
                    max_queue=128,     # Increased queue size for better handling of bursts (was 64)
                    close_timeout=TimeoutConfig.WEBSOCKET_CLOSE_TIMEOUT,  # Use configurable close timeout
                    open_timeout=TimeoutConfig.WEBSOCKET_OPEN_TIMEOUT,   # Use configurable open timeout
                    compression=None,  # Disable compression to reduce complexity
                )
                
                if server:
                    print("\n=== WebSocket Server Details ===")
                    print("Status: Running")
                    print(f"Address: ws://localhost:{port}")
                    print(f"Bind: 127.0.0.1 (loopback only)")
                    print("Enhanced Configuration for Deadline Error Prevention:")
                    print(f"  - Ping interval: 30s (heartbeat)")
                    print(f"  - Ping timeout: {TimeoutConfig.WEBSOCKET_PING_TIMEOUT}s (deadline handling)")
                    print(f"  - Open timeout: {TimeoutConfig.WEBSOCKET_OPEN_TIMEOUT}s")
                    print(f"  - Close timeout: {TimeoutConfig.WEBSOCKET_CLOSE_TIMEOUT}s")
                    print(f"  - Response timeout: {TimeoutConfig.RESPONSE_TIMEOUT}s (extendable to {TimeoutConfig.RESPONSE_TIMEOUT_EXTENDED}s)")
                    print(f"  - Circuit breaker cooldown: {TimeoutConfig.CIRCUIT_BREAKER_COOLDOWN}s")
                    print("  - Enhanced error recovery enabled")
                    print("  - API usage monitoring active")
                    print("Waiting for connections...")
                    print("\nPress Ctrl+C to stop the server")
                    
                    # Add status endpoint for health check
                    try:
                        # Start a simple HTTP server for status checks on a different port
                        status_port = port + 1
                        if not is_port_in_use(status_port):
                            # Start HTTP server in a separate thread
                            import threading
                            
                            def start_http_server():
                                server = start_status_server(status_port)
                                server.serve_forever()
                            
                            threading.Thread(target=start_http_server, daemon=True).start()
                            print(f"Status HTTP server started on port {status_port}")
                    except Exception as e:
                        print(f"Error starting status HTTP server: {e}")
                    
                    # Start the cleanup task
                    cleanup_task = asyncio.create_task(periodic_cleanup(cleanup_interval_sec))
                    
                    return server, cleanup_task
                    
                else:
                    print(f"Failed to create server instance on attempt {retry_count + 1}")
                    
            except OSError as e:
                if "address already in use" in str(e).lower() and retry_count < max_retries - 1:
                    retry_count += 1
                    print(f"\nPort {port} is still in use. Retrying ({retry_count}/{max_retries})...")
                    
                    # Try to free the port again
                    free_port(port)
                    await asyncio.sleep(3 * retry_count)  # Increased backoff
                else:
                    print(f"Failed to start server after {retry_count + 1} attempts: {e}")
                    raise
            except Exception as e:
                print(f"Unexpected error during server startup (attempt {retry_count + 1}): {e}")
                if retry_count < max_retries - 1:
                    retry_count += 1
                    await asyncio.sleep(2)
                else:
                    raise
                    
        return None, None
        
    except Exception as e:
        print(f"\nServer initialization error: {e}")
        traceback.print_exc()
        return None, None 