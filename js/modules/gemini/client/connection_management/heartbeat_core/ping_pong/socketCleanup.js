/**
 * socketCleanup.js
 * Helper functions for cleaning up intervals and defensive error handling.
 */

window.NativePingPongCore = window.NativePingPongCore || {};

window.NativePingPongCore.cleanupHealthInterval = function (webSocket) {
    if (webSocket && webSocket._connectionHealthInterval) {
        try {
            clearInterval(webSocket._connectionHealthInterval);
            webSocket._connectionHealthInterval = null;
            console.log("Successfully cleaned up WebSocket connection health interval");
        } catch (e) {
            console.warn("Error cleaning up connection health interval:", e);
        }
    }
};

window.NativePingPongCore.storeHealthInterval = function (webSocket, intervalId) {
    try {
        if (webSocket && typeof webSocket === 'object') {
            webSocket._connectionHealthInterval = intervalId;
            console.log("Connection health interval assigned successfully");
        } else {
            throw new Error("WebSocket object is invalid for interval assignment");
        }
    } catch (e) {
        console.warn("Could not assign connection health interval to WebSocket:", e);
        clearInterval(intervalId);

        // Fallback storage
        try {
            window._webSocketHealthIntervals = window._webSocketHealthIntervals || [];
            window._webSocketHealthIntervals.push(intervalId);
            console.log("Stored connection health interval in global fallback storage");
        } catch (fallbackError) {
            console.error("Failed to store interval in fallback storage:", fallbackError);
            clearInterval(intervalId);
        }
    }
};

console.log("socketCleanup.js loaded.");
