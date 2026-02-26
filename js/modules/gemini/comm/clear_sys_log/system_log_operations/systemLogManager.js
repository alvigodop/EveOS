/**
 * Clears the system log messages container
 * This function is exposed globally and also added to the ClearSystemLogCommunicationPanel namespace
 */
function clearSystemLog() {
    const systemLog = document.getElementById('systemLog');
    const messagesContainer = systemLog.querySelector('.system-messages-container');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
        // Assuming displayMessage is globally available when this is called
        // from main.js, which should be the case when an event triggers this.
        displayMessage("System Message: System log cleared");
    }
}

/**
 * Initializes the Clear System Log handler
 * Sets up the event listener for the Clear System Log button
 */
function initializeClearSystemLogHandler() {
    console.log('Clear System Log handler initialization started.');
    
    const clearSystemLogButton = document.getElementById('clearSystemLogButton');
    if (!clearSystemLogButton) {
        console.error('Clear System Log button not found. Handler initialization failed.');
        return;
    }

    // Remove any existing event listeners to prevent duplicates
    clearSystemLogButton.removeEventListener('click', clearSystemLog);
    
    // Add the event listener
    clearSystemLogButton.addEventListener('click', clearSystemLog);
    console.log('Clear System Log button event listener attached successfully.');
}

// Initialize or ensure the namespace exists
if (!window.CommunicationPanel) {
    window.CommunicationPanel = {};
}
if (!window.CommunicationPanel.ClearSystemLogCommunicationPanel) {
    window.CommunicationPanel.ClearSystemLogCommunicationPanel = {};
}

// Expose the functions via the namespace
window.CommunicationPanel.ClearSystemLogCommunicationPanel.clearSystemLog = clearSystemLog;
window.CommunicationPanel.ClearSystemLogCommunicationPanel.initializeClearSystemLogHandler = initializeClearSystemLogHandler; 