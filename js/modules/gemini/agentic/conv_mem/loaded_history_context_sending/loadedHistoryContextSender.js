// js/modules/gemini/Conversation_Memory_Agentic/loaded_history_context_sending/loadedHistoryContextSender.js

console.log("js/modules/gemini/Conversation_Memory_Agentic/loaded_history_context_sending/loadedHistoryContextSender.js started loading");

// Define the send loaded history function in the ConversationMemoryAgentic namespace
window.ConversationMemoryAgentic.sendLoadedHistoryAsContext = function() {
    const content = document.getElementById('previousConversationContent');
    if (!content) {
        console.error("Previous conversation content element not found");
        return;
    }

    const messages = content.getElementsByClassName('chat-message');
    let historyText = "[SYSTEM: Providing loaded chat history as context]\n\n";
    
    Array.from(messages).forEach(message => {
        if (message.textContent && !message.className.includes('previous-chat-controls')) {
            // Get the message text content
            let messageText = message.textContent.trim();
            
            // Check what type of message it is based on the class
            if (message.classList.contains('previous-user-message')) {
                // Replace [User]: with USER: 
                messageText = messageText.replace(/^\[User\]:\s*/, "USER: ");
            } else if (message.classList.contains('previous-gemini-message')) {
                // Replace [Gemini]: with GEMINI: 
                messageText = messageText.replace(/^\[Gemini\]:\s*/, "GEMINI: ");
            } else if (message.classList.contains('previous-system-message')) {
                // Replace [System]: with SYSTEM: 
                messageText = messageText.replace(/^\[System\]:\s*/, "SYSTEM: ");
                // Skip system messages if they're just status updates
                if (messageText.includes("Connection") || 
                    messageText.includes("initialized") || 
                    messageText.includes("Processing")) {
                    return;
                }
            }
            
            historyText += messageText + "\n";
        }
    });
    
    historyText += "\n[SYSTEM: End of loaded history context. Please acknowledge this history and continue the conversation.]";
    
    // Display a preview of what's being sent in the system log
    if (typeof displayMessage === 'function') {
        displayMessage("System Message: Sending loaded chat history as context", true);
    }
    
    // Create a custom payload with history metadata flag
    const payload = {
        realtime_input: {
            media_chunks: [{
                mime_type: "text/plain",
                data: historyText
            }]
        },
        is_system_context: true,
        is_history_metadata: true
    };
    
    // Send the payload directly
    if (typeof webSocket !== 'undefined' && webSocket && webSocket.readyState === WebSocket.OPEN) {
        try {
            webSocket.send(JSON.stringify(payload));
            
            // Display the message in the system log
            if (typeof displayMessage === 'function') {
                displayMessage(historyText, true);
                displayMessage("System Message: Loaded chat history sent as context", true);
            }
        } catch (error) {
            console.error("Error sending loaded history context:", error);
            if (typeof displayMessage === 'function') {
                displayMessage("System Message: Error sending loaded chat history context", true);
            }
        }
    } else {
        console.warn("WebSocket not connected - cannot send loaded history context");
        if (typeof displayMessage === 'function') {
            displayMessage("System Message: Cannot send context - WebSocket not connected", true);
        }
    }
};

// Expose globally for backward compatibility
window.sendLoadedHistoryAsContext = window.ConversationMemoryAgentic.sendLoadedHistoryAsContext;

console.log("Loaded history context sending functionality initialized in ConversationMemoryAgentic namespace");
console.log("js/modules/gemini/Conversation_Memory_Agentic/loaded_history_context_sending/loadedHistoryContextSender.js finished loading and initial execution"); 