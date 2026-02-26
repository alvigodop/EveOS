// js/modules/gemini/comm/hist_toggle/Toggle_Conversation_History_Commuication_Panel.js - Loads all JS for Toggle Conversation History Communication Panel Features

console.log("js/modules/gemini/comm/hist_toggle/Toggle_Conversation_History_Commuication_Panel.js started loading");

// Initialize the SendChatHistoryPanel namespace
window.SendChatHistoryPanel = window.SendChatHistoryPanel || {};

// Define the base path for Send Chat History Communication Panel modules
const SEND_CHAT_HISTORY_BASE_PATH = 'js/modules/gemini/comm/hist_toggle';

const sendChatHistoryScriptsToLoad = [
    // Conversation History UI
    `${SEND_CHAT_HISTORY_BASE_PATH}/conversation_history_ui/conversationHistoryToggler.js`,
    `${SEND_CHAT_HISTORY_BASE_PATH}/conversation_history_ui/previousConversationClearHandler.js`,

    // Conversation History Operations
    `${SEND_CHAT_HISTORY_BASE_PATH}/conversation_history_operations/fullConversationHistoryClearer.js`,

    // History Message Sorting
    `${SEND_CHAT_HISTORY_BASE_PATH}/history_message_sorting/historyMessageSorter.js`,

    // Chat History Local Storage
    `${SEND_CHAT_HISTORY_BASE_PATH}/chat_history_local_storage/localStorageHelper.js`
];

function loadSendChatHistoryScripts() {
    const fragment = document.createDocumentFragment();
    sendChatHistoryScriptsToLoad.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        // script.onload = initializeSendChatHistoryModule; // Call init after each script or after all scripts
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Initialize the Send Chat History Communication Panel module
function initializeSendChatHistoryModule() {
    console.log("Initializing Send Chat History Communication Panel module...");

    // Ensure the global namespace exists
    if (!window.SendChatHistoryPanel) {
        window.SendChatHistoryPanel = {};
    }

    // Functions from the loaded scripts will be globally available as per their individual definitions.
    // If specific namespacing is needed for functions within SendChatHistoryPanel, 
    // those functions would need to be explicitly assigned to window.SendChatHistoryPanel here
    // after ensuring their respective scripts have loaded and defined them.
    // For now, we are ensuring the panel loader follows the agentic pattern.

    // Example of how functions *could* be assigned if they were not already global:
    // window.SendChatHistoryPanel.toggleConversationHistory = window.toggleConversationHistory;
    // window.SendChatHistoryPanel.saveChatToLocalStorage = window.saveChatToLocalStorage;
    // ... and so on for other relevant functions.

    console.log("Send Chat History Communication Panel module initialized");
}

// Load scripts
loadSendChatHistoryScripts();

// Initialize after a short delay to help ensure scripts are loaded
// Similar to how Agentic_js_Functions.js and other modules handle it.
setTimeout(initializeSendChatHistoryModule, 500);

console.log("js/modules/gemini/comm/hist_toggle/Toggle_Conversation_History_Commuication_Panel.js finished loading and initial execution");

// Export Send Chat History Communication Panel related functions/objects for global use (if any are centralized here)
// For now, functions are mostly global from their individual files.
window.SendChatHistoryPanel = {
    // Placeholder for any panel-specific functions or state that might be centralized in the future
    // For example:
    // toggleHistory: null, 
    // clearHistory: null,
    // saveChat: null
}; 