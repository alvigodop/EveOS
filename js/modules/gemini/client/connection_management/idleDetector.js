/**
 * idleDetector.js
 * Handles user activity tracking and idle detection.
 */

console.log("idleDetector.js started loading");

let isClientIdle = false;
let lastUserActivity = Date.now();
let idleCheckInterval = null;

// Add idle detection to optimize ping behavior
function startIdleDetection() {
    // Track user activity
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    const updateActivity = () => {
        lastUserActivity = Date.now();
        if (isClientIdle) {
            isClientIdle = false;
            console.log("User activity detected - exiting idle mode");
        }
    };

    activityEvents.forEach(event => {
        document.addEventListener(event, updateActivity, true);
    });

    // Check for idle state periodically
    idleCheckInterval = setInterval(() => {
        const timeSinceActivity = Date.now() - lastUserActivity;
        const wasIdle = isClientIdle;
        isClientIdle = timeSinceActivity > 300000; // 5 minutes of inactivity = idle

        if (isClientIdle && !wasIdle) {
            console.log("Client entering idle mode - optimizing ping frequency");

            // If enhanced connection monitoring is needed, it can be triggered here
            if (typeof displayMessage === 'function') {
                displayMessage("System Message: Client idle mode - enhanced connection monitoring active", true);
            }
        }
    }, 30000); // Check every 30 seconds
}

function stopIdleDetection() {
    if (idleCheckInterval) {
        clearInterval(idleCheckInterval);
        idleCheckInterval = null;
    }
    isClientIdle = false;
}

// Expose checks for other modules
window.isClientIdle = () => isClientIdle;
window.getLastUserActivity = () => lastUserActivity;
// Also allow updating lastUserActivity from outside (e.g. websocket activity)
window.updateLastUserActivity = () => { lastUserActivity = Date.now(); };

window.startIdleDetection = startIdleDetection;
window.stopIdleDetection = stopIdleDetection;
