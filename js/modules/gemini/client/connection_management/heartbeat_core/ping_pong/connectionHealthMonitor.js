/**
 * connectionHealthMonitor.js
 * Manages the periodic connection health check loop.
 */

window.NativePingPongCore = window.NativePingPongCore || {};

window.NativePingPongCore.startConnectionHealthMonitor = function (webSocket) {
    const connectionHealthInterval = setInterval(() => {
        // Defensive checks
        if (!webSocket) {
            console.log("Connection health monitor stopped - WebSocket reference is null");
            clearInterval(connectionHealthInterval);
            return;
        }

        if (webSocket.readyState === WebSocket.CLOSED || webSocket.readyState === WebSocket.CLOSING) {
            console.log("Connection health monitor stopped - WebSocket is closed/closing");
            clearInterval(connectionHealthInterval);
            return;
        }

        try {
            const now = Date.now();
            const lastActivity = (typeof getLastUserActivity === 'function') ? getLastUserActivity() : now;
            const timeSinceLastActivity = now - lastActivity;

            // Idle detection integration
            const isIdle = (typeof isClientIdle === 'function') ? isClientIdle() : false;

            if (timeSinceLastActivity > 300000 && !isIdle && typeof startIdleDetection === 'function') { // 5 minutes
                console.log("Client idle detected - enhanced connection monitoring active");
                if (typeof displayMessage === 'function') {
                    displayMessage("System Message: Client idle mode - enhanced connection monitoring active", true);
                }
            } else if (timeSinceLastActivity <= 60000 && isIdle) { // 1 minute of activity
                console.log("Client activity resumed - normal connection monitoring");
            }

            // Periodic Health Reporting (every 5 minutes during idle)
            if (timeSinceLastActivity > 300000 && (timeSinceLastActivity % 300000 < 30000)) {
                const readyStateNames = {
                    [WebSocket.CONNECTING]: 'CONNECTING',
                    [WebSocket.OPEN]: 'OPEN',
                    [WebSocket.CLOSING]: 'CLOSING',
                    [WebSocket.CLOSED]: 'CLOSED'
                };

                console.log(`=== Connection Health Report ===`);
                console.log(`WebSocket State: ${readyStateNames[webSocket.readyState] || webSocket.readyState}`);
                console.log(`Idle Duration: ${Math.round(timeSinceLastActivity / 1000)}s`);
                console.log(`Buffer Amount: ${webSocket.bufferedAmount || 0} bytes`);
                console.log(`Connection Health Interval: ${webSocket._connectionHealthInterval ? 'Active' : 'Inactive'}`);
                console.log(`===========================`);
            }

        } catch (error) {
            console.warn("Error in connection health monitor:", error);
        }

    }, 30000); // Check every 30 seconds

    // Store the interval using the cleanup utility
    if (window.NativePingPongCore.storeHealthInterval) {
        window.NativePingPongCore.storeHealthInterval(webSocket, connectionHealthInterval);
    } else {
        console.error("NativePingPongCore.storeHealthInterval not found!");
        clearInterval(connectionHealthInterval);
    }
};

console.log("connectionHealthMonitor.js loaded.");
