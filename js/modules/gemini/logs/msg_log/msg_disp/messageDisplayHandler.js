// messageDisplayHandler.js
// Refactored to delegate to SystemMessageDisplayHandler and MessageUiCreator

function displayMessage(message, isSystemMessage = false) {
    // 1. Check for System Message
    // Matches explicit flag OR known system prefixes
    if (isSystemMessage ||
        message.startsWith("System Message:") ||
        message.startsWith("Voice check:") ||
        message.startsWith("[SYSTEM:")) {

        if (window.MessagingLog && window.MessagingLog.SystemMessageDisplayHandler) {
            window.MessagingLog.SystemMessageDisplayHandler.handleMessage(message);
        } else {
            console.error("SystemMessageDisplayHandler not loaded. Dropping system message:", message);
        }
        return;
    }

    // 2. Handle Chat Message
    if (window.MessagingLog && window.MessagingLog.MessageUiCreator) {
        window.MessagingLog.MessageUiCreator.createAndAppend(message);

        // Save chat to localStorage after adding a chat message
        if (typeof saveChatToLocalStorage === 'function') {
            saveChatToLocalStorage();
        }
    } else {
        console.error("MessageUiCreator not loaded. Cannot display chat message:", message);
    }
}

// Initialize system log display (now just delegates to the handler's flusher if needed)
function initializeSystemLogDisplay() {
    console.log(`[System Message Debug] System log display initialized`);
    if (window.MessagingLog && window.MessagingLog.SystemMessageDisplayHandler) {
        window.MessagingLog.SystemMessageDisplayHandler.flushPendingMessages();
    }
}

// Expose the initialization function
window.initializeSystemLogDisplay = initializeSystemLogDisplay;
window.displayMessage = displayMessage; // Ensure global exposure
