// js/modules/gemini/comm/past_chats/Toggle_Past_Chats_Commuication_Panel.js - Loads all JS for Toggle Past Chats Communication Panel Features

console.log("js/modules/gemini/comm/past_chats/Toggle_Past_Chats_Commuication_Panel.js started loading");

// Initialize the TogglePastChatsPanel namespace
window.TogglePastChatsPanel = window.TogglePastChatsPanel || {};

// Define the base path for Toggle Past Chats Communication Panel modules
const TOGGLE_PAST_CHATS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/past_chats';

const togglePastChatsScriptsToLoad = [
    // Past Chats State
    `${TOGGLE_PAST_CHATS_BASE_PATH}/past_chats_state/pastChatsState.js`,

    // Past Chats UI
    `${TOGGLE_PAST_CHATS_BASE_PATH}/past_chats_ui/pastChatManager.js`,
    `${TOGGLE_PAST_CHATS_BASE_PATH}/past_chats_ui/pastChatsVisibilityToggler.js`,

    // Previous Chat Display Management
    `${TOGGLE_PAST_CHATS_BASE_PATH}/previous_chat_display_management/previousChatEditor.js?v=0.1.1`
];

function loadTogglePastChatsScripts() {
    const fragment = document.createDocumentFragment();
    togglePastChatsScriptsToLoad.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        // script.onload = initializeTogglePastChatsModule; // Call init after each script or after all scripts
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Initialize the Toggle Past Chats Communication Panel module
function initializeTogglePastChatsModule() {
    console.log("Initializing Toggle Past Chats Communication Panel module...");

    // Ensure the global namespace exists
    if (!window.TogglePastChatsPanel) {
        window.TogglePastChatsPanel = {};
    }

    // Functions from the loaded scripts will be globally available as per their individual definitions.
    // If specific namespacing is needed for functions within TogglePastChatsPanel, 
    // those functions would need to be explicitly assigned to window.TogglePastChatsPanel here
    // after ensuring their respective scripts have loaded and defined them.

    // Example of potential assignments if needed:
    // window.TogglePastChatsPanel.togglePastChats = window.togglePastChats;
    // window.TogglePastChatsPanel.updatePastChatsDisplay = window.updatePastChatsDisplay;

    console.log("Toggle Past Chats Communication Panel module initialized");
}

// Load scripts
loadTogglePastChatsScripts();

// Initialize after a short delay to help ensure scripts are loaded
setTimeout(initializeTogglePastChatsModule, 500);

console.log("js/modules/gemini/comm/past_chats/Toggle_Past_Chats_Commuication_Panel.js finished loading and initial execution");

// Export Toggle Past Chats Communication Panel related functions/objects for global use
window.TogglePastChatsPanel = {
    // Properties for accessing the past chats UI functionality
    // will be populated by the initialization function
}; 
