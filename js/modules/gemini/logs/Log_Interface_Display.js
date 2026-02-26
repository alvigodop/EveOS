// js/modules/gemini/logs/Log_Interface_Display.js
// This file loads all modularized JavaScript files for Log Interface Display features.
// Script loading is now handled by js/modules/gemini/Script_Loader/Script_Loader.js

console.log("js/modules/gemini/logs/Log_Interface_Display.js started loading");

// Initialize the LogInterfaceDisplay namespace
window.LogInterfaceDisplay = window.LogInterfaceDisplay || {};

// Initialize the Log Interface Display module
function initializeLogInterfaceDisplayModule() {
    console.log("Initializing Log Interface Display module...");

    // Add any top-level initialization logic for the Log Interface Display module here
    // This function will be called after each script in logInterfaceDisplayScripts finishes loading.
    // It can be used to consolidate namespace properties or perform actions dependent on all scripts being present.

    console.log("Log Interface Display module initialized");
}

// Initialize after a short delay to help ensure scripts are loaded
setTimeout(initializeLogInterfaceDisplayModule, 500); 