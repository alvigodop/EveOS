// Ensure the namespace exists
window.CommunicationPanel = window.CommunicationPanel || {};
window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel = window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel || {};
window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI = window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI || {};

/**
 * Initializes the handler for the clear previous conversation button.
 * Finds the button and attaches the click event listener.
 */
function initializePreviousConversationClearHandler() {
    console.log('Initializing previous conversation clear handler.');
    const clearButton = document.getElementById('clearPreviousConversationButton');

    if (!clearButton) {
        console.error("Element with ID 'clearPreviousConversationButton' not found for previousConversationClearHandler. Handler will not be fully initialized.");
        return;
    }

    clearButton.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear the previous conversation history? This cannot be undone.")) {
            const previousConversationContent = document.getElementById('previousConversationContent');
            if (previousConversationContent) {
                previousConversationContent.innerHTML = '';
            }
            
            // webSocket and displayMessage are expected to be global
            if (typeof webSocket !== 'undefined' && webSocket && webSocket.readyState === WebSocket.OPEN) {
                webSocket.send(JSON.stringify({ command: "clear_history" }));
                if (typeof displayMessage === 'function') {
                    displayMessage("System Message: Chat history cleared from server", true);
                }
            } else {
                if (typeof displayMessage === 'function') {
                    displayMessage("System Message: Could not clear server history - connection not available", true);
                }
            }
        }
    });
     console.log('Previous conversation clear handler initialization complete.');
}

// Expose the initialization function via the namespace
window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.initializePreviousConversationClearHandler = initializePreviousConversationClearHandler;