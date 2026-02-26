/**
 * socketConnectionCoordinator.js
 * Main coordinator module for Socket Connection Core.
 * Aggregates functionality and exposes it to the global namespace.
 */

window.SocketConnectionCore = window.SocketConnectionCore || {};

function callSocketCoreMethod(methodName, ...args) {
    const method = window.SocketConnectionCore && window.SocketConnectionCore[methodName];
    if (typeof method === 'function') {
        return method(...args);
    }
    console.warn(`SocketConnectionCore.${methodName} is not ready yet.`);
    return undefined;
}

// Expose lazy global wrappers so load-order does not break connection startup
window.connect = (...args) => callSocketCoreMethod('connect', ...args);
window.attemptConnection = (...args) => callSocketCoreMethod('attemptConnection', ...args);
window.resetConnection = (...args) => callSocketCoreMethod('resetConnection', ...args);
window.stopAutoReconnect = (...args) => callSocketCoreMethod('stopAutoReconnect', ...args);
window.startAutoReconnect = (...args) => callSocketCoreMethod('startAutoReconnect', ...args);

console.log("socketConnectionCoordinator.js loaded - Core functions exposed (connect, reset, attempt).");
