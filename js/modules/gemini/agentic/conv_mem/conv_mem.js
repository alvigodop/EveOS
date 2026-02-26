// js/modules/gemini/agentic/Conversation_Memory_Agentic/Conversation_Memory_Agentic.js
// Loads and connects all conversation memory related functionality

console.log("js/modules/gemini/agentic/Conversation_Memory_Agentic/Conversation_Memory_Agentic.js started loading");

// Initialize the ConversationMemoryAgentic namespace
window.ConversationMemoryAgentic = window.ConversationMemoryAgentic || {};

// Define the base path for conversation memory modules
const CONVERSATION_MEMORY_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/agentic/conv_mem';

// List of conversation memory related scripts to load
const conversationMemoryScripts = [
    // Core state management
    `${CONVERSATION_MEMORY_BASE_PATH}/chat_history_state/chatHistoryState.js`,
    `${CONVERSATION_MEMORY_BASE_PATH}/chat_history_management/historyStateResetter.js`,

    // Memory and context control
    `${CONVERSATION_MEMORY_BASE_PATH}/context_memory_toggle_handler/contextMemoryToggleHandler.js`,

    // History sending operations
    `${CONVERSATION_MEMORY_BASE_PATH}/chat_history_sending_operations/chatHistorySender.js`,
    `${CONVERSATION_MEMORY_BASE_PATH}/loaded_history_context_sending/loadedHistoryContextSender.js`,
    `${CONVERSATION_MEMORY_BASE_PATH}/initial_context_sending/initialContextSender.js`,
    `${CONVERSATION_MEMORY_BASE_PATH}/current_chat_context_sending/currentChatContextSender.js`
];

// Load all conversation memory related scripts
function loadConversationMemoryScripts() {
    const fragment = document.createDocumentFragment();
    conversationMemoryScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Initialize the conversation memory module
function initializeConversationMemoryModule() {
    // Initialize any required state or event listeners here
    console.log("Initializing Conversation Memory Agentic module...");

    // Set up initial state
    window.ConversationMemoryAgentic = {
        ...window.ConversationMemoryAgentic,
        resetHistoryState: null,    // Will be defined by historyStateResetter.js
        sendChatHistory: null,      // Will be defined by chatHistorySender.js
        sendInitialContext: null,   // Will be defined by initialContextSender.js
        sendCurrentChatAsContext: null, // Will be defined by currentChatContextSender.js
        historyLoaded: false,       // Will be managed by chatHistoryState.js
        historyMessages: new Set(), // Will be managed by chatHistoryState.js
        historyMessageOrder: [],    // Will be managed by chatHistoryState.js
        contextMemoryEnabled: true  // Default value, will be managed by contextMemoryToggleHandler.js
    };

    // Set up event listener for WebSocket connection to send initial context
    window.addEventListener('websocketConnected', () => {
        console.log("WebSocket connected, checking if initial context needs to be sent");
        // Check if chat was restored and context memory is enabled
        const chatRestored = localStorage.getItem('chatRestored') === 'true';
        if (chatRestored && window.ConversationMemoryAgentic.isContextMemoryEnabled()) {
            console.log("Chat was restored and context memory is enabled, scheduling initial context send");
            window.ConversationMemoryAgentic.scheduleInitialContextSending(true);
        }
    });

    console.log("Conversation Memory Agentic module initialized");
}

// Load scripts
loadConversationMemoryScripts();

// Initialize after a short delay to ensure scripts are loaded
setTimeout(initializeConversationMemoryModule, 500);

console.log("js/modules/gemini/agentic/Conversation_Memory_Agentic/Conversation_Memory_Agentic.js finished loading and initial execution");

// Export conversation memory related functions for global use
window.ConversationMemoryAgentic = {
    resetHistoryState: null,    // Will be defined by historyStateResetter.js
    sendChatHistory: null,      // Will be defined by chatHistorySender.js
    sendInitialContext: null,   // Will be defined by initialContextSender.js
    sendCurrentChatAsContext: null, // Will be defined by currentChatContextSender.js
    historyLoaded: false,       // Will be managed by chatHistoryState.js
    historyMessages: new Set(), // Will be managed by chatHistoryState.js
    historyMessageOrder: []     // Will be managed by chatHistoryState.js
}; 