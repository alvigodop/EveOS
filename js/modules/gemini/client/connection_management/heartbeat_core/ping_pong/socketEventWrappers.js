/**
 * socketEventWrappers.js
 * Wraps WebSocket close and error events with enhanced handling and cleanup.
 */

window.NativePingPongCore = window.NativePingPongCore || {};

window.NativePingPongCore.wrapCloseHandler = function (webSocket) {
    const originalClose = webSocket.onclose;
    webSocket.onclose = function (event) {
        console.log(`WebSocket close event: code=${event.code}, reason='${event.reason}', wasClean=${event.wasClean}`);

        // Cleanup health interval first
        if (window.NativePingPongCore.cleanupHealthInterval) {
            window.NativePingPongCore.cleanupHealthInterval(this);
        }

        // Error code handling
        if (event.code === 1011) {
            console.log("WebSocket closed due to ping timeout (code 1011) - server didn't receive client pong");
            if (typeof displayMessage === 'function') {
                displayMessage("System Message: Connection closed due to keepalive timeout - reconnecting...", true);
            }
        } else if (event.code === 1006) {
            console.log("WebSocket closed abnormally (code 1006) - possible network issue or server restart");
            if (typeof displayMessage === 'function') {
                displayMessage("System Message: Connection lost unexpectedly - reconnecting...", true);
            }
        } else if (event.code === 1000) {
            console.log("WebSocket closed normally (code 1000)");
        } else if (event.code === 1001) {
            console.log("WebSocket closed - endpoint going away (code 1001)");
        } else {
            console.log(`WebSocket closed with code ${event.code}: ${event.reason || 'No reason provided'}`);
        }

        // Call original handler
        if (originalClose && typeof originalClose === 'function') {
            try {
                originalClose.call(this, event);
            } catch (e) {
                console.warn("Error in original close handler:", e);
            }
        }
    };
};

window.NativePingPongCore.wrapErrorHandler = function (webSocket) {
    const originalError = webSocket.onerror;
    webSocket.onerror = function (event) {
        console.error("WebSocket error detected:", event);

        // Cleanup on error too
        if (window.NativePingPongCore.cleanupHealthInterval) {
            window.NativePingPongCore.cleanupHealthInterval(this);
        }

        // Call original handler
        if (originalError && typeof originalError === 'function') {
            try {
                originalError.call(this, event);
            } catch (e) {
                console.warn("Error in original error handler:", e);
            }
        }
    };
};

console.log("socketEventWrappers.js loaded.");
