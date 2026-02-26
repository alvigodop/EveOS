/**
 * Updates the system status message periodically.
 * This function relies on:
 *  - A global variable 'lastStatusUpdate' (expected to be initialized, e.g., 'let lastStatusUpdate = 0;' in main.js).
 *  - A global function 'displayMessage(message, isSystemMessage)'.
 */
function updateSystemStatus() {
    const now = Date.now();

    // Check if lastStatusUpdate is available; it should be declared and initialized in main.js
    if (typeof lastStatusUpdate === 'undefined') {
        console.error('Global variable lastStatusUpdate is not defined. System status updates might fail or be inaccurate. Please declare "let lastStatusUpdate = 0;" in main.js.');
        // Fallback initialization to prevent NaN issues if main.js was not updated.
        // This will create an implicit global if not declared with let/const elsewhere.
        // The correct fix is to ensure 'let lastStatusUpdate = 0;' is in main.js.
        lastStatusUpdate = 0; 
    }

    if (now - lastStatusUpdate < 30000) { // Only update every 30 seconds
        return;
    }
    lastStatusUpdate = now; // Modifies the global lastStatusUpdate
    const timeStr = new Date().toLocaleTimeString();
    
    if (typeof displayMessage === 'function') {
        displayMessage(`System Message: [${timeStr}] Connection active`, true);
    } else {
        console.error('Global function displayMessage is not defined. Cannot display system status.');
    }
}

console.log("js/modules/gemini/Log_Interface_Display/Messaging_System_Log/system_status_operations/systemStatusUpdater.js finished loading"); 