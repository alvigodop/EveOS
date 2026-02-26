import asyncio
import time
import traceback
from ...error_handling.api_error_handler import api_error_handler
from .session_registry import active_sessions
from .session_limits import semaphore_acquired, session_semaphore

async def cleanup_resources(connection_id: str):
    """Clean up resources for a connection"""
    try:
        # Clean up error tracking
        api_error_handler.cleanup_connection(connection_id)
        
        # Clean up session data
        if connection_id in active_sessions:
            print(f"Cleaning up resources for connection: {connection_id}")
            del active_sessions[connection_id]
        
        # Handle semaphore release
        if connection_id in semaphore_acquired:
            print(f"Releasing semaphore for connection: {connection_id}")
            semaphore_acquired.remove(connection_id)
            session_semaphore.release()
            print(f"Released session semaphore, available slots: {session_semaphore._value}")
        
        print(f"Active sessions after cleanup: {len(active_sessions)}")
        print(f"Connections with semaphores: {len(semaphore_acquired)}")
    except Exception as e:
        print(f"Error during cleanup for connection {connection_id}: {e}")
        traceback.print_exc()

async def periodic_cleanup(cleanup_interval_sec):
    """Perform periodic cleanup of inactive sessions."""
    while True:
        try:
            await asyncio.sleep(cleanup_interval_sec)
            print("\n=== Periodic Session Cleanup ===")
            print(f"Active sessions before cleanup: {len(active_sessions)}")
            print(f"Connections with semaphores: {len(semaphore_acquired)}")
            
            # Check for orphaned semaphores
            for conn_id in list(semaphore_acquired):
                if conn_id not in active_sessions:
                    print(f"Found orphaned semaphore for connection {conn_id}, releasing")
                    semaphore_acquired.remove(conn_id)
                    session_semaphore.release()
            
            # Check for dead connections
            for conn_id in list(active_sessions.keys()):
                session_info = active_sessions[conn_id]
                connected_at = session_info.get("connected_at", "unknown")
                last_active = session_info.get("last_active", 0)
                
                # If a connection hasn't been active for 5 minutes, consider it dead
                if time.time() - last_active > 300:
                    print(f"Connection {conn_id} inactive for >5 minutes, removing from active sessions")
                    if conn_id in active_sessions:
                        del active_sessions[conn_id]
                    
                    if conn_id in semaphore_acquired:
                        print(f"Releasing semaphore for inactive connection: {conn_id}")
                        semaphore_acquired.remove(conn_id)
                        session_semaphore.release()
                        print(f"Released session semaphore, available slots: {session_semaphore._value}")
            
            # Log active sessions
            for conn_id, session_info in list(active_sessions.items()):
                connected_at = session_info.get("connected_at", "unknown")
                print(f"Session {conn_id} connected at {connected_at}")
            print("=== Cleanup Complete ===\n")
        except Exception as e:
            print(f"Error in periodic cleanup: {e}")
