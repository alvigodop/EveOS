// js/modules/gemini/Conversation_Memory_Agentic/current_chat_context_sending/currentChatContextSender.js

console.log("js/modules/gemini/Conversation_Memory_Agentic/current_chat_context_sending/currentChatContextSender.js started loading");

// Define the function in the ConversationMemoryAgentic namespace
window.ConversationMemoryAgentic.sendCurrentChatAsContext = function() {
    // First check if we have a chat log with messages
    const chatLog = document.getElementById('chatLog');
    if (!chatLog) {
        console.error("Chat log element not found");
        return;
    }

    const messages = chatLog.getElementsByClassName('chat-message');
    
    if (messages.length === 0) {
        console.log("No chat messages to send as context");
        return;
    }
    
    console.log(`Sending ${messages.length} messages as conversation context`);
    
    // Create context text from chat messages with very clear role separation
    let contextText = "[SYSTEM: This is the previous conversation history between the human user and you (the AI assistant). The AI assistant should respond naturally to questions and never pretend to be the human user.]\n\n";
    
    Array.from(messages).forEach(message => {
        // Check what type of message it is based on the class
        let prefix = "";
        let content = "";
        
        if (message.classList.contains('user-message')) {
            prefix = "HUMAN_USER: ";  // Very clearly mark human messages
            // Extract user message content 
            const contentElem = message.querySelector('.message-content');
            content = contentElem ? contentElem.textContent : message.textContent;
        } else if (message.classList.contains('gemini-message')) {
            prefix = "AI_ASSISTANT: ";  // Very clearly mark AI messages
            // Extract Gemini message content
            const contentElem = message.querySelector('.message-content');
            content = contentElem ? contentElem.textContent : message.textContent;
        } else {
            // Skip system messages
            return;
        }
        
        contextText += prefix + content + "\n";
    });
    
    // Add system instructions based on whether self-talk is enabled
    const selfTalkStateForContext = window.getAISelfTalkState ? window.getAISelfTalkState() : { isEnabled: false, systemMessage: "[SYSTEM: You are the AI_ASSISTANT in this conversation. The human user is identified as HUMAN_USER. Never generate messages as if you were the human user. Always maintain your role as the AI assistant. Wait for the human user to send a message before responding. DO NOT continue the conversation without user input. Never respond to yourself with follow-up messages.]" };
    if (selfTalkStateForContext.isEnabled) {
        contextText += "\n" + selfTalkStateForContext.systemMessage;
    } else {
        contextText += "\n[SYSTEM: You are the AI_ASSISTANT in this conversation. The human user is identified as HUMAN_USER. Never generate messages as if you were the human user. Always maintain your role as the AI assistant. Wait for the human user to send a message before responding. DO NOT continue the conversation without user input. Never respond to yourself with follow-up messages.]";
    }
    
    contextText += "\n";
    
    // Display a system message
    if (typeof displayMessage === 'function') {
        displayMessage("System Message: Sending chat history as context to AI model", true);
    }
    
    // Create a custom payload with the context
    const payload = {
        realtime_input: {
            media_chunks: [{
                mime_type: "text/plain",
                data: contextText
            }]
        },
        is_system_context: true,
        is_history_metadata: true
    };
    
    // Send the payload to the AI model
    if (typeof webSocket !== 'undefined' && webSocket && webSocket.readyState === WebSocket.OPEN) {
        try {
            webSocket.send(JSON.stringify(payload));
            console.log("Sent chat context to Gemini");
        } catch (error) {
            console.error("Error sending chat context:", error);
            if (typeof displayMessage === 'function') {
                displayMessage("System Message: Error sending chat context to model", true);
            }
        }
    } else {
        console.error("WebSocket not connected, cannot send context");
        if (typeof displayMessage === 'function') {
            displayMessage("System Message: Cannot send context - WebSocket not connected", true);
        }
    }
};

// Expose globally for backward compatibility
window.sendCurrentChatAsContext = window.ConversationMemoryAgentic.sendCurrentChatAsContext;

console.log("Current chat context sending functionality initialized in ConversationMemoryAgentic namespace");
console.log("js/modules/gemini/Conversation_Memory_Agentic/current_chat_context_sending/currentChatContextSender.js finished loading and initial execution"); 