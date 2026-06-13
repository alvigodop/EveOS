/**
 * openEventHandler.js
 * Handles WebSocket open events.
 */

window.SocketConnectionCore = window.SocketConnectionCore || {};
window.SocketConnectionCore.EventHandlers = window.SocketConnectionCore.EventHandlers || {};

window.SocketConnectionCore.EventHandlers.handleOpen = function (event) {
    const State = window.SocketGlobalState;
    console.log("WebSocket connection opened successfully!");
    State.isConnecting = false;
    State.reconnectAttempts = 0;
    State.connectionBackoffDelay = State.INITIAL_CONNECTION_ATTEMPT_INTERVAL;
    State.isInitialConnection = false;

    // Clear continuous reconnect if it's running
    if (State.continuousReconnectInterval) {
        clearInterval(State.continuousReconnectInterval);
        State.continuousReconnectInterval = null;
    }

    // Start application-level ping/pong to keep connection alive
    if (typeof startApplicationLevelPingPong === 'function') startApplicationLevelPingPong();

    // Setup native WebSocket ping/pong handling for browser support
    if (typeof setupNativeWebSocketPingPong === 'function') setupNativeWebSocketPingPong(window.webSocket);

    // Show connecting status until Gemini API is ready
    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connecting', 'Connected to server - Initializing Gemini API...');

    if (typeof displayMessage === 'function') {
        displayMessage("System Message: Connected to server, initializing Gemini API...", true);
    }

    // Automatically send setup message with saved voice configuration
    if (typeof sendAutoSetupMessage === 'function') sendAutoSetupMessage();
};

console.log("openEventHandler.js loaded.");
