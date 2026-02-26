//const MESSAGING_INTERFACE_BASE_PATH = 'js/modules/gemini/logs/msg_int';
// js/modules/gemini/Messaging_Interface/Messaging_Interface.js - Loads all modularized JavaScript files for the Messaging Interface features
// Script loading is now handled by js/modules/gemini/Script_Loader/Script_Loader.js

console.log("js/modules/gemini/Log_Interface_Display/Messaging_Interface/Messaging_Interface.js started loading");

// Initialize the MessagingInterface namespace
window.MessagingInterface = window.MessagingInterface || {};

// Initialize the Messaging Interface module
function initializeMessagingInterfaceModule() {
    console.log("Initializing Messaging Interface module...");

    // Ensure the global namespace exists
    if (!window.MessagingInterface) {
        window.MessagingInterface = {};
    }

    // Functions from the loaded scripts are expected to be globally available 
    // or managed within their own scopes/namespaces.

    console.log("Messaging Interface module initialized");
}

// Initialize after a short delay to help ensure scripts are loaded
setTimeout(initializeMessagingInterfaceModule, 500);

console.log("js/modules/gemini/Log_Interface_Display/Messaging_Interface/Messaging_Interface.js finished loading and initial execution");

// Export Messaging Interface related functions/objects for global use (if any are centralized here)
// For now, functions are mostly global from their individual files.
window.MessagingInterface = {
    // Placeholder for any panel-specific functions or state that might be centralized in the future
    // For example:
    // sendText: null,
    // clearInput: null,
    // togglePopout: null
}; 