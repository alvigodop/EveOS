// js/modules/gemini/Conversation_Memory_Agentic/chat_history_management/historyStateResetter.js

console.log("js/modules/gemini/Conversation_Memory_Agentic/chat_history_management/historyStateResetter.js started loading");

// Define the reset function in the ConversationMemoryAgentic namespace
window.ConversationMemoryAgentic.resetHistoryState = function() {
    // Reset state using the namespace functions
    window.ConversationMemoryAgentic.setHistoryLoaded(false);
    window.ConversationMemoryAgentic.historyMessages = new Set();
    window.ConversationMemoryAgentic.historyMessageOrder = [];
    
    // Update global variables for backward compatibility
    window.historyMessages = window.ConversationMemoryAgentic.historyMessages;
    window.historyMessageOrder = window.ConversationMemoryAgentic.historyMessageOrder;
    
    const previousConversationContent = document.getElementById('previousConversationContent');
    if (previousConversationContent) {
        // Clear content
        previousConversationContent.innerHTML = '';
    }
    
    const previousConversationLog = document.getElementById('previousConversationLog');
    if (previousConversationLog) {
        previousConversationLog.style.display = 'none';
    }
};

// Expose globally for backward compatibility
window.resetHistoryState = window.ConversationMemoryAgentic.resetHistoryState;

console.log("History state reset functionality initialized in ConversationMemoryAgentic namespace");
console.log("js/modules/gemini/Conversation_Memory_Agentic/chat_history_management/historyStateResetter.js finished loading and initial execution"); 