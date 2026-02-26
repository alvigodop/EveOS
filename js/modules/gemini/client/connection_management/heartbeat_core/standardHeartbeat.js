/**
 * standardHeartbeat.js
 * Handles the standard legacy heartbeat mechanism.
 */

console.log("standardHeartbeat.js loading...");

let heartbeatInterval = null;
let heartbeatTimeout = null;
const HEARTBEAT_INTERVAL = 30000; // Send ping every 30 seconds
const HEARTBEAT_TIMEOUT = 120000; // Wait 120 seconds for pong response (matching server timeout)
const MAX_MISSED_PONGS = 3; // Allow up to 3 missed pongs before closing connection
const IDLE_PING_FREQUENCY = 60000; // Send pings more frequently when idle (every 60 seconds)

let missedPongs = 0;

// Add enhanced heartbeat functionality with idle detection
function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    // Start idle detection
    if (typeof startIdleDetection === 'function') {
        startIdleDetection();
    }

    heartbeatInterval = setInterval(() => {
        if (window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
            try {
                // Use different ping intervals based on idle state
                const now = Date.now();
                const lastActivity = (typeof getLastUserActivity === 'function') ? getLastUserActivity() : now;
                const timeSinceActivity = now - lastActivity;
                const isIdle = (typeof isClientIdle === 'function') ? isClientIdle() : false;

                const shouldPing = isIdle ?
                    (timeSinceActivity % IDLE_PING_FREQUENCY < 1000) :
                    true;

                if (shouldPing) {
                    window.webSocket.send(JSON.stringify({ ping: true }));
                    console.log("Sent heartbeat ping" + (isIdle ? " (idle mode)" : ""));

                    // Set timeout for pong response with enhanced error handling
                    if (heartbeatTimeout) {
                        clearTimeout(heartbeatTimeout);
                    }

                    heartbeatTimeout = setTimeout(() => {
                        missedPongs++;
                        console.log(`Heartbeat pong timeout (${missedPongs}/${MAX_MISSED_PONGS}) - connection may be unstable`);

                        if (missedPongs >= MAX_MISSED_PONGS) {
                            console.log("Too many missed pongs - connection is likely dead, closing WebSocket");
                            if (window.webSocket) {
                                window.webSocket.close(1000, "Heartbeat timeout");
                            }
                        }
                    }, HEARTBEAT_TIMEOUT);
                }

            } catch (error) {
                console.error("Error sending heartbeat ping:", error);
                if (window.webSocket) {
                    window.webSocket.close();
                }
            }
        }
    }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout);
        heartbeatTimeout = null;
    }

    if (typeof stopIdleDetection === 'function') {
        stopIdleDetection();
    }
    missedPongs = 0;
}

// Global exposure
window.startHeartbeat = startHeartbeat;
window.stopHeartbeat = stopHeartbeat;

console.log("standardHeartbeat.js loaded.");
