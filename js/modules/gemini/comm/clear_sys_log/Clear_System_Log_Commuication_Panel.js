// js/modules/gemini/comm/clear_sys_log/Clear_System_Log_Commuication_Panel.js
// Loads all modularized JavaScript// js/modules/gemini/comm/clear_sys_log/Clear_System_Log_Commuication_Panel.js

console.log("js/modules/gemini/comm/clear_sys_log/Clear_System_Log_Commuication_Panel.js started loading");

// Define the base path for Clear System Log Communication Panel modules
const CLEAR_SYSTEM_LOG_COMM_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/clear_sys_log';

// List of Clear System Log Communication Panel scripts to load
const clearSystemLogCommunicationPanelScriptsToLoad = [
    `${CLEAR_SYSTEM_LOG_COMM_BASE_PATH}/system_log_operations/systemLogManager.js?v=acb9da7166b2`, // Manages operations for the system log, such as clearing it.
];

// Initialize the namespace structure ONCE.
// It will be populated as scripts load and their onload events fire.
if (!window.ClearSystemLogCommunicationPanel) {
    window.ClearSystemLogCommunicationPanel = {
        clearSystemLog: null
    };
    console.log("ClearSystemLogCommunicationPanel namespace initialized globally.");
}

// Load all Clear System Log Communication Panel scripts
function loadClearSystemLogCommunicationPanelScripts() {
    const fragment = document.createDocumentFragment();
    clearSystemLogCommunicationPanelScriptsToLoad.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        script.onload = function () { // Use a function wrapper for onload
            console.log(`${scriptPath} loaded.`);
            initializeClearSystemLogCommunicationPanelModule();
        };
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
    console.log("Clear System Log Communication Panel child scripts are being loaded.");
}

// Initialize/Populate Clear System Log Communication Panel functionality after scripts load
function initializeClearSystemLogCommunicationPanelModule() {
    // Namespace already initialized. This function populates it.

    // Attempt to link globally available functions from loaded scripts to the namespace
    if (typeof clearSystemLog === 'function' && !window.ClearSystemLogCommunicationPanel.clearSystemLog) {
        window.ClearSystemLogCommunicationPanel.clearSystemLog = clearSystemLog;
        console.log("clearSystemLog function linked to ClearSystemLogCommunicationPanel namespace.");
    }
}

// Load the scripts.
loadClearSystemLogCommunicationPanelScripts();

console.log("js/modules/gemini/comm/clear_sys_log/Clear_System_Log_Commuication_Panel.js finished loading and initial execution. Child scripts are loading asynchronously."); 