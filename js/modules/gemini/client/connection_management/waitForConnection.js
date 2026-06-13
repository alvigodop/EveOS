// js/modules/gemini/Client_Core_Control/connection_management/waitForConnection.js
function waitForConnection(callback, interval) {
    if (window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
        callback();
    } else {
        if (window.SocketGlobalState?.autoReconnectEnabled
            && !window.SocketGlobalState?.isConnecting
            && typeof window.SocketConnectionCore?.startAutoReconnect === 'function') {
            window.SocketConnectionCore.startAutoReconnect();
        }
        setTimeout(function() {
            waitForConnection(callback, interval);
        }, interval);
    }
}
