// js/modules/gemini/Messaging_System_Log/Messaging_System_Log.js - Loads all modularized JavaScript files for the Messaging System Log features

console.log("js/modules/gemini/Log_Interface_Display/Messaging_System_Log/Messaging_System_Log.js started loading");

// Define the base path for Messaging System Log modules (relative to this file's directory structure within main_js_files)
const MESSAGING_SYSTEM_LOG_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/logs/sys_log';

const messagingSystemLogScripts = [
    `${MESSAGING_SYSTEM_LOG_BASE_PATH}/system_status_operations/systemStatusUpdater.js`, // Periodically updates system status messages (e.g., connection active).
    `${MESSAGING_SYSTEM_LOG_BASE_PATH}/error_handling_ui/quotaErrorHandler.js`, // Handles UI display for API quota errors or deadline exceeded issues.
    `${MESSAGING_SYSTEM_LOG_BASE_PATH}/server_reboot_button/serverRebootButtonHandler.js` // Handles the server reboot button functionality.
];

// Initialize the namespace structure ONCE.
// It will be populated as scripts load and their onload events fire.
if (!window.MessagingSystemLog) {
    window.MessagingSystemLog = {
        // Functions/objects from loaded scripts can be linked here if needed
        // Example: updateSystemStatus: null,
        //          handleQuotaError: null
    };
    console.log("MessagingSystemLog namespace initialized globally.");
}

function loadMessagingSystemLogScripts() {
    const fragment = document.createDocumentFragment();
    messagingSystemLogScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        // The scriptPath variable already contains the full path relative to the HTML file
        script.src = scriptPath;
        script.defer = true;
        script.onload = initializeMessagingSystemLogModule; // Add onload to call initializer after each script loads
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
    console.log("Messaging System Log child scripts are being loaded.");
}

// Initialize/Populate Messaging System Log functionality after scripts load
function initializeMessagingSystemLogModule() {
    // Namespace already initialized. This function can populate it.

    // Attempt to link globally available functions from loaded scripts to the namespace
    // For now, these functions seem globally accessible anyway, but linking here is good practice
    if (typeof updateSystemStatus === 'function' && !window.MessagingSystemLog.updateSystemStatus) {
        // Note: updateSystemStatus requires 'lastStatusUpdate' global variable from main.js
        window.MessagingSystemLog.updateSystemStatus = updateSystemStatus;
        console.log("updateSystemStatus function linked to MessagingSystemLog namespace.");
    }
    if (typeof handleQuotaError === 'function' && !window.MessagingSystemLog.handleQuotaError) {
        window.MessagingSystemLog.handleQuotaError = handleQuotaError;
        console.log("handleQuotaError function linked to MessagingSystemLog namespace.");
    }
}

// Load scripts
loadMessagingSystemLogScripts();

console.log("js/modules/gemini/Messaging_System_Log/Messaging_System_Log.js finished loading and initial execution. Child scripts are loading asynchronously.");

// Export functions for global use (optional, as they are already globally defined or will be linked)
// window.updateSystemStatus = window.MessagingSystemLog.updateSystemStatus;
// window.handleQuotaError = window.MessagingSystemLog.handleQuotaError; 