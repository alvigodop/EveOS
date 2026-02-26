/**
 * nativePingPongCoordinator.js
 * Coordinator for Native Ping Pong Core.
 * Exposes setupNativeWebSocketPingPong.
 */

window.NativePingPongCore = window.NativePingPongCore || {};

window.setupNativeWebSocketPingPong = function (webSocket) {
    console.log("Setting up native WebSocket ping/pong handling (Modularized)");

    if (!webSocket) {
        console.error("Invalid WebSocket passed to setupNativeWebSocketPingPong");
        return;
    }

    // Attach handlers
    if (window.NativePingPongCore.attachPingHandler) {
        window.NativePingPongCore.attachPingHandler(webSocket);
    }
    if (window.NativePingPongCore.attachPongHandler) {
        window.NativePingPongCore.attachPongHandler(webSocket);
    }

    // Wrap events
    if (window.NativePingPongCore.wrapCloseHandler) {
        window.NativePingPongCore.wrapCloseHandler(webSocket);
    }
    if (window.NativePingPongCore.wrapErrorHandler) {
        window.NativePingPongCore.wrapErrorHandler(webSocket);
    }

    // Start health monitor
    if (window.NativePingPongCore.startConnectionHealthMonitor) {
        window.NativePingPongCore.startConnectionHealthMonitor(webSocket);
    }

    console.log("Enhanced WebSocket ping/pong monitoring configured (Modularized)");
};

console.log("nativePingPongCoordinator.js loaded.");
