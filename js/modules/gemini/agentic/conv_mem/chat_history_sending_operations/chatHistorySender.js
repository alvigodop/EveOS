// js/modules/gemini/Conversation_Memory_Agentic/chat_history_sending_operations/chatHistorySender.js

console.log("js/modules/gemini/Conversation_Memory_Agentic/chat_history_sending_operations/chatHistorySender.js started loading");

// Define the send chat history function in the ConversationMemoryAgentic namespace
window.ConversationMemoryAgentic.sendChatHistory = function() {
    const content = document.getElementById('previousConversationContent');
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
        webSocket.send(JSON.stringify(payload));
        
        // Display the message in the system log
        if (typeof displayMessage === 'function') {
            displayMessage(historyText, true);
            displayMessage("System Message: Loaded chat history sent as context", true);
        }
    } else {
        if (typeof displayMessage === 'function') {
            displayMessage("System Message: Cannot send context - WebSocket not connected", true);
        }
    }
};

// Expose globally for backward compatibility
window.sendChatHistory = window.ConversationMemoryAgentic.sendChatHistory;

console.log("Chat history sending functionality initialized in ConversationMemoryAgentic namespace");
console.log("js/modules/gemini/Conversation_Memory_Agentic/chat_history_sending_operations/chatHistorySender.js finished loading and initial execution"); 