console.log("js/modules/gemini/Conversation_Memory_Agentic/initial_context_sending/initialContextSender.js started loading");

/**
 * Schedules the sending of the current chat history as context if it was restored
 * from localStorage and context memory is enabled.
 * This function is intended to be called on page load.
 *
 * @param {boolean} chatRestored - Indicates whether the chat history was successfully restored from localStorage.
 */
window.ConversationMemoryAgentic.scheduleInitialContextSending = function(chatRestored) {
    // Wait for a short period to ensure other initializations can occur
    setTimeout(() => {
        // Use the namespace's context memory enabled state
        if (chatRestored && window.ConversationMemoryAgentic.isContextMemoryEnabled()) {
            // Further delay to ensure the model is likely initialized and ready
            setTimeout(() => {
                // Check WebSocket state before sending context
                if (typeof window.webSocket !== 'undefined' && window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
                    if (typeof window.sendCurrentChatAsContext === 'function') {
                        window.sendCurrentChatAsContext();
                    } else {
                        console.error("sendCurrentChatAsContext function not found. Cannot send initial context.");
                    }
                } else {
                    console.log("WebSocket not ready for sending initial context after restore.");
                }
            }, 5000); // Wait 5 seconds (aligned with original logic)
        }
    }, 2000); // Wait 2 seconds (aligned with original logic)
};

// Expose globally for backward compatibility
window.scheduleInitialContextSending = window.ConversationMemoryAgentic.scheduleInitialContextSending;

console.log("Initial context sending functionality initialized in ConversationMemoryAgentic namespace");
console.log("js/modules/gemini/Conversation_Memory_Agentic/initial_context_sending/initialContextSender.js finished loading and initial execution"); 