/**
 * appPingPong.js
 * Handles application-level ping/pong logic.
 */

console.log("appPingPong.js loading...");

// WebSocket ping/pong configuration for application-level keepalive
const APPLICATION_PING_INTERVAL = 30000; // Send application ping every 30 seconds 
const APPLICATION_PING_TIMEOUT = 10000; // Wait 10 seconds for application pong response
const APPLICATION_PING_MESSAGE = "ping"; // Application-level ping message
const APPLICATION_PONG_MESSAGE = "pong"; // Application-level pong message

let applicationPingInterval = null;
let applicationPingTimeout = null;
let waitingForApplicationPong = false;
let applicationPingRetries = 0;
const MAX_APPLICATION_PING_RETRIES = 3;

// Replace the old startHeartbeat function with application-level ping/pong
function startApplicationLevelPingPong() {
    if (applicationPingInterval) {
        clearInterval(applicationPingInterval);
    }

    // Start idle detection
    if (typeof startIdleDetection === 'function') {
        startIdleDetection();
    }

    applicationPingInterval = setInterval(() => {
        if (window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
            // Check if we're already waiting for a pong and handle retries
            if (waitingForApplicationPong) {
                applicationPingRetries++;
                console.log(`Application pong timeout - retry ${applicationPingRetries}/${MAX_APPLICATION_PING_RETRIES}`);

                if (applicationPingRetries >= MAX_APPLICATION_PING_RETRIES) {
                    console.log("Too many failed application pings - connection is likely dead, closing WebSocket");
                    if (window.webSocket) {
                        window.webSocket.close(1000, "Application ping timeout");
                    }
                    return;
                }
            }

            try {
                const now = Date.now();
                const isIdle = (typeof isClientIdle === 'function') ? isClientIdle() : false;

                // Simplified ping logic - always send pings at regular intervals
                // Remove the complex idle detection that was causing missed pings
                window.webSocket.send(JSON.stringify({
                    type: "application_ping",
                    message: APPLICATION_PING_MESSAGE,
                    timestamp: now,
                    retry_count: applicationPingRetries
                }));
                console.log("Sent application-level ping" + (isIdle ? " (idle mode)" : " (active mode)"));

                waitingForApplicationPong = true;

                // Set timeout for application pong response
                if (applicationPingTimeout) {
                    clearTimeout(applicationPingTimeout);
                }

                applicationPingTimeout = setTimeout(() => {
                    console.log("Application pong timeout - connection may be unstable");
                    // Don't close immediately, let the retry logic handle it
                }, APPLICATION_PING_TIMEOUT);

            } catch (error) {
                console.error("Error sending application ping:", error);
                if (window.webSocket) {
                    window.webSocket.close();
                }
            }
        }
    }, APPLICATION_PING_INTERVAL);

    console.log("Application-level ping/pong started with 30s interval");
}

function stopApplicationLevelPingPong() {
    if (applicationPingInterval) {
        clearInterval(applicationPingInterval);
        applicationPingInterval = null;
    }
    if (applicationPingTimeout) {
        clearTimeout(applicationPingTimeout);
        applicationPingTimeout = null;
    }
    waitingForApplicationPong = false;
    applicationPingRetries = 0;

    if (typeof stopIdleDetection === 'function') {
        stopIdleDetection();
    }
}

function handleApplicationPong() {
    console.log("Received application-level pong from server");
    waitingForApplicationPong = false;
    applicationPingRetries = 0;

    // Clear application ping timeout since we got a pong
    if (applicationPingTimeout) {
        clearTimeout(applicationPingTimeout);
        applicationPingTimeout = null;
    }
}

// Global exposure
window.startApplicationLevelPingPong = startApplicationLevelPingPong;
window.stopApplicationLevelPingPong = stopApplicationLevelPingPong;
window.handleApplicationPong = handleApplicationPong;

console.log("appPingPong.js loaded.");
