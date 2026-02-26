// js/modules/gemini/comm/clear_chat/Clear_Chat_Communication_Panel.js - Loads all modularized JavaScript files for Clear Chat Communication Panel Features

console.log("js/modules/gemini/comm/clear_chat/Clear_Chat_Communication_Panel.js started loading");

// Define the base path for Clear Chat Communication Panel modules
const CLEAR_CHAT_COMM_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/clear_chat';

// List of Clear Chat Communication Panel scripts to load
const clearChatCommunicationPanelScriptsToLoad = [
    `${CLEAR_CHAT_COMM_BASE_PATH}/chat_clearing_operations/chatClearHandler.js`, // Handles clearing of current chat, past chats, or all chat data.
    // System log operations now moved to Clear_System_Log_Commuication_Panel
];

// Initialize the namespace structure ONCE.
// It will be populated as scripts load and their onload events fire.
if (!window.ClearChatCommunicationPanel) {
    window.ClearChatCommunicationPanel = {
        clearChat: null
        // System log operations now moved to Clear_System_Log_Commuication_Panel
        // Functions like closeDialog, clearCurrentChat, etc., are made global by clearChat()
        // when it's executed. They are not namespaced here directly at load time.
    };
    console.log("ClearChatCommunicationPanel namespace initialized globally.");
}

// Load all Clear Chat Communication Panel scripts
function loadClearChatCommunicationPanelScripts() {
    const fragment = document.createDocumentFragment();
    clearChatCommunicationPanelScriptsToLoad.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        script.onload = function () { // Use a function wrapper for onload
            console.log(`${scriptPath} loaded.`);
            initializeClearChatCommunicationPanelModule();
        };
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
    console.log("Clear Chat Communication Panel child scripts are being loaded.");
}

// Initialize/Populate Clear Chat Communication Panel functionality after scripts load
function initializeClearChatCommunicationPanelModule() {
    // Namespace already initialized. This function populates it.

    // Attempt to link globally available functions from loaded scripts to the namespace
    if (typeof clearChat === 'function' && !window.ClearChatCommunicationPanel.clearChat) {
        window.ClearChatCommunicationPanel.clearChat = clearChat;
        console.log("clearChat function linked to ClearChatCommunicationPanel namespace.");
    }
    // System log operations now moved to Clear_System_Log_Commuication_Panel
}

// Load the scripts.
loadClearChatCommunicationPanelScripts();

console.log("js/modules/gemini/comm/clear_chat/Clear_Chat_Communication_Panel.js finished loading and initial execution. Child scripts are loading asynchronously."); 