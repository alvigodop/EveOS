/**
 * socketConnectionState.js
 * Handles connection reset state logic and cleanup.
 */

window.SocketConnectionCore = window.SocketConnectionCore || {};

window.SocketConnectionCore.resetConnection = function () {
    const State = window.SocketGlobalState;
    if (!State) {
        console.error("SocketGlobalState not initialized");
        return;
    }

    State.resetState();

    // Stop application-level ping/pong when resetting connection
    if (typeof stopApplicationLevelPingPong === 'function') {
        stopApplicationLevelPingPong();
    }

    if (window.webSocket) {
        // Clean up native WebSocket monitoring explicitly
        if (window.webSocket._connectionHealthInterval) {
            try {
                clearInterval(window.webSocket._connectionHealthInterval);
                window.webSocket._connectionHealthInterval = null;
            } catch (e) {
                console.warn("Error cleaning up connection health interval in reset:", e);
            }
        }

        // Remove listeners to prevent zombie callbacks if they trigger just before closing
        window.webSocket.onopen = null;
        window.webSocket.onclose = null;
        window.webSocket.onerror = null;
        window.webSocket.onmessage = null;

        window.webSocket.close();
        window.webSocket = null;
    }

    // Store connection status without trying to update UI immediately during initialization
    if (typeof updateConnectionStatus === 'function') {
        updateConnectionStatus('disconnected', 'Disconnected');
    }

    // Reset self-talk timeout
    if (typeof selftalkTimeout !== 'undefined' && selftalkTimeout) {
        clearTimeout(selftalkTimeout);
        selftalkTimeout = null;
    }

    // Reset history state when resetting connection
    if (typeof resetHistoryState === 'function') {
        resetHistoryState();
    }
};

console.log("socketConnectionState.js loaded.");
