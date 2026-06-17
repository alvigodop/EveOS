/**
 * closeEventHandler.js
 * Handles WebSocket close events.
 */

window.SocketConnectionCore = window.SocketConnectionCore || {};
window.SocketConnectionCore.EventHandlers = window.SocketConnectionCore.EventHandlers || {};

window.SocketConnectionCore.EventHandlers.handleClose = function (event) {
    const State = window.SocketGlobalState;
    console.log("WebSocket closed:", event);
    State.isConnecting = false;

    // Clean up native WebSocket monitoring FIRST
    if (window.webSocket && window.webSocket._connectionHealthInterval) {
        try {
            clearInterval(window.webSocket._connectionHealthInterval);
            window.webSocket._connectionHealthInterval = null;
        } catch (e) {
            console.warn("Error cleaning up connection health interval:", e);
        }
    }

    // Stop application-level ping/pong
    if (typeof stopApplicationLevelPingPong === 'function') stopApplicationLevelPingPong();

    window.webSocket = null;

    if (State.credentialRequired) {
        if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus('error', State.apiPolicyBlocked ? 'API Key Restricted' : 'API Key Required');
        }
        return;
    }

    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('disconnected', 'Connection Lost');

    if (State.autoReconnectEnabled && State.reconnectAttempts < State.MAX_RECONNECT_ATTEMPTS) {
        if (typeof displayMessage === 'function') {
            displayMessage(`System Message: Connection lost - reconnecting... (attempt ${State.reconnectAttempts + 1}/${State.MAX_RECONNECT_ATTEMPTS})`, true);
        }

        State.reconnectAttempts++;

        // Get fresh state
        const currentPreviewState = (typeof getPreviewModelState === 'function') ? getPreviewModelState() : { isPreviewModel: false, consecutivePreviewModelFailures: 0, previewModelBackoffMultiplier: 1 };

        let baseDelay = State.INITIAL_CONNECTION_ATTEMPT_INTERVAL * Math.pow(2, State.reconnectAttempts - 1);

        if (currentPreviewState.isPreviewModel && currentPreviewState.consecutivePreviewModelFailures > 0) {
            baseDelay *= currentPreviewState.previewModelBackoffMultiplier;
            console.log(`Applying preview model backoff multiplier: ${currentPreviewState.previewModelBackoffMultiplier}x`);
        }

        State.connectionBackoffDelay = Math.min(baseDelay, State.MAX_BACKOFF_INTERVAL);

        const displayDelay = Math.round(State.connectionBackoffDelay / 1000);
        if (currentPreviewState.isPreviewModel) {
            if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connecting', `Preview model reconnecting in ${displayDelay}s...`);
        } else {
            if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connecting', `Reconnecting in ${displayDelay}s...`);
        }

        if (State.reconnectTimeout) {
            clearTimeout(State.reconnectTimeout);
        }

        State.reconnectTimeout = setTimeout(() => {
            if (typeof window.attemptConnection === 'function') {
                window.attemptConnection();
            } else {
                console.warn("window.attemptConnection not available for reconnect");
            }
        }, State.connectionBackoffDelay);

    } else if (State.autoReconnectEnabled && State.reconnectAttempts >= State.MAX_RECONNECT_ATTEMPTS) {
        // Get fresh state
        const currentPreviewState = (typeof getPreviewModelState === 'function') ? getPreviewModelState() : { isPreviewModel: false };

        if (typeof displayMessage === 'function') {
            if (currentPreviewState.isPreviewModel) {
                displayMessage("System Message: Preview model connection attempts exhausted. Starting continuous reconnection with extended delays...", true);
            } else {
                displayMessage("System Message: Maximum reconnection attempts reached. Starting continuous reconnection...", true);
            }
        }
        if (typeof updateConnectionStatus === 'function') updateConnectionStatus('waiting', 'Waiting for Server...');
        // Start continuous attempts for server startup scenarios
        if (typeof startContinuousReconnectAttempts === 'function') window.startContinuousReconnectAttempts();
    }
};

console.log("closeEventHandler.js loaded.");
