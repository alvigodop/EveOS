/**
 * socketConnectionCoordinator.js
 * Main coordinator module for Socket Connection Core.
 * Aggregates functionality and exposes it to the global namespace.
 */

window.SocketConnectionCore = window.SocketConnectionCore || {};

// Expose functions globally for backward compatibility and cross-module access
window.connect = window.SocketConnectionCore.connect;
window.attemptConnection = window.SocketConnectionCore.attemptConnection;
window.resetConnection = window.SocketConnectionCore.resetConnection;
window.stopAutoReconnect = window.SocketConnectionCore.stopAutoReconnect;
window.startAutoReconnect = window.SocketConnectionCore.startAutoReconnect;

console.log("socketConnectionCoordinator.js loaded - Core functions exposed (connect, reset, attempt).");
