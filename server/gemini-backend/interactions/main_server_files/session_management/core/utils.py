import websockets
import json

async def safe_send(websocket, message, connection_id):
    """Helper function to safely send a message to the websocket."""
    try:
        if websocket.state in (websockets.protocol.State.CLOSED, websockets.protocol.State.CLOSING):
            print(f"WebSocket is closed (state: {websocket.state}) for connection {connection_id}")
            return False
            
        await websocket.send(message)
        return True
    except Exception as e:
        print(f"Error sending message to connection {connection_id}: {e}")
        return False
