/**
 * pingPongHandlers.js
 * Handles native ping/pong events.
 */

window.NativePingPongCore = window.NativePingPongCore || {};

window.NativePingPongCore.attachPingHandler = function (webSocket) {
    if (typeof webSocket.onping === 'undefined') {
        webSocket.onping = function (event) {
            console.log("[WebSocket Debug] Received PING from server, browser will auto-respond with PONG");
            // Browser automatically sends PONG response
            if (typeof updateLastUserActivity === 'function') updateLastUserActivity();
        };
    }
};

window.NativePingPongCore.attachPongHandler = function (webSocket) {
    if (typeof webSocket.onpong === 'undefined') {
        webSocket.onpong = function (event) {
            console.log("[WebSocket Debug] Received PONG from server. Connection active.");
            if (typeof updateLastUserActivity === 'function') updateLastUserActivity();
        };
    }
};

console.log("pingPongHandlers.js loaded.");
