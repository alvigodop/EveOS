// js/modules/gemini/Client_Core_Control/connection_management/waitForConnection.js
function waitForConnection(callback, interval) {
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        callback();
    } else {
        setTimeout(function() {
            waitForConnection(callback, interval);
        }, interval);
    }
} 