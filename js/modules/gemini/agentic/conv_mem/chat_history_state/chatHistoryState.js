// js/modules/gemini/Conversation_Memory_Agentic/chat_history_state/chatHistoryState.js
// This file initializes and manages the state related to chat history messages and loading status.

console.log("js/modules/gemini/Conversation_Memory_Agentic/chat_history_state/chatHistoryState.js started loading");

// Initialize state in the ConversationMemoryAgentic namespace
window.ConversationMemoryAgentic.historyLoaded = false;
window.ConversationMemoryAgentic.historyMessages = new Set();
window.ConversationMemoryAgentic.historyMessageOrder = [];

// Also expose globally for backward compatibility
window.historyLoaded = window.ConversationMemoryAgentic.historyLoaded;
window.historyMessages = window.ConversationMemoryAgentic.historyMessages;
window.historyMessageOrder = window.ConversationMemoryAgentic.historyMessageOrder;

// Add getter/setter functions to the namespace
window.ConversationMemoryAgentic.isHistoryLoaded = () => window.ConversationMemoryAgentic.historyLoaded;
window.ConversationMemoryAgentic.setHistoryLoaded = (loaded) => { 
    window.ConversationMemoryAgentic.historyLoaded = loaded;
    window.historyLoaded = loaded; // Update global for backward compatibility
};
window.ConversationMemoryAgentic.getHistoryMessagesSet = () => window.ConversationMemoryAgentic.historyMessages;
window.ConversationMemoryAgentic.getHistoryMessageOrder = () => window.ConversationMemoryAgentic.historyMessageOrder;

console.log("Chat history state initialized in ConversationMemoryAgentic namespace");
console.log("js/modules/gemini/Conversation_Memory_Agentic/chat_history_state/chatHistoryState.js finished loading and initial execution"); 