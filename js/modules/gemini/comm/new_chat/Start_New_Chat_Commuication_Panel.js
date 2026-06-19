// js/modules/gemini/comm/new_chat/Start_New_Chat_Commuication_Panel.js - Loads all JS for Start New Chat Communication Panel Features

console.log("js/modules/gemini/comm/new_chat/Start_New_Chat_Commuication_Panel.js started loading");

// Initialize the StartNewChatPanel namespace
window.StartNewChatPanel = window.StartNewChatPanel || {};

// Define the base path for Start New Chat Communication Panel modules
const START_NEW_CHAT_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/new_chat';

const startNewChatScriptsToLoad = [
    // New Chat Operations
    `${START_NEW_CHAT_BASE_PATH}/new_chat_operations/newChatHandler.js?v=0.1.1`
];

function loadStartNewChatScripts() {
    const fragment = document.createDocumentFragment();
    startNewChatScriptsToLoad.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Initialize the Start New Chat Communication Panel module
function initializeStartNewChatModule() {
    console.log("Initializing Start New Chat Communication Panel module...");

    // Ensure the global namespace exists
    if (!window.StartNewChatPanel) {
        window.StartNewChatPanel = {};
    }

    // Functions from newChatHandler.js will be globally available
    // If specific namespacing is needed, functions would need to be explicitly assigned here
    // after ensuring their respective scripts have loaded and defined them.

    console.log("Start New Chat Communication Panel module initialized");
}

// Load scripts
loadStartNewChatScripts();

// Initialize after a short delay to help ensure scripts are loaded
setTimeout(initializeStartNewChatModule, 500);

console.log("js/modules/gemini/comm/new_chat/Start_New_Chat_Commuication_Panel.js finished loading and initial execution");

// Export Start New Chat Communication Panel related functions/objects for global use
window.StartNewChatPanel = {
    // Placeholder for any panel-specific functions or state that might be centralized in the future
    startNewChat: null // Will be populated by newChatHandler.js
}; 