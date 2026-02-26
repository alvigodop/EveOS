// js/modules/gemini/Messaging_Log/Messaging_Log.js - Loads all modularized JavaScript files for Messaging Log features

console.log("js/modules/gemini/Log_Interface_Display/Messaging_Log/Messaging_Log.js started loading");

// Initialize the MessagingLog namespace
window.MessagingLog = window.MessagingLog || {};

// Define the base path for Messaging Log modules
const MESSAGING_LOG_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/logs/msg_log';

// List of Messaging Log scripts to load
// List of Messaging Log scripts to load
const messagingLogScripts = [
    `${MESSAGING_LOG_BASE_PATH}/msg_disp/messaging_ui_core/messagingUiLoader.js`,
    `${MESSAGING_LOG_BASE_PATH}/msg_disp/audio_player/audioPlayerComponentCreator.js`,
    `${MESSAGING_LOG_BASE_PATH}/msg_disp/audio_player/audioAutoPlayHandler.js`,
    `${MESSAGING_LOG_BASE_PATH}/msg_disp/audio_player/audioPlayerEventHandler.js`,
    `${MESSAGING_LOG_BASE_PATH}/msg_disp/incomingMessageHandler.js`,
    `${MESSAGING_LOG_BASE_PATH}/msg_disp/messageDisplayHandler.js`,
    `${MESSAGING_LOG_BASE_PATH}/message_counting/messageCounter.js`
];

// Load all Messaging Log scripts
function loadMessagingLogScripts() {
    const fragment = document.createDocumentFragment();
    messagingLogScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        script.onload = initializeMessagingLogModule;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Initialize Messaging Log functionality after scripts load
function initializeMessagingLogModule() {
    console.log("Initializing Messaging Log module...");

    // Ensure the global namespace exists
    if (!window.MessagingLog) {
        window.MessagingLog = {};
    }

    // Link globally available functions from loaded scripts to the namespace
    // Assuming these functions are made global by their respective scripts
    if (typeof showIncomingMessage === 'function') {
        window.MessagingLog.showIncomingMessage = showIncomingMessage;
        console.log("showIncomingMessage function linked to MessagingLog namespace.");
    }
    if (typeof displayMessage === 'function') {
        window.MessagingLog.displayMessage = displayMessage;
        console.log("displayMessage function linked to MessagingLog namespace.");
    }
    if (typeof messageCounter !== 'undefined') {
        window.MessagingLog.messageCounter = messageCounter;
        console.log("messageCounter linked to MessagingLog namespace.");
    }

    console.log("Messaging Log module initialized");
}

// Load scripts
loadMessagingLogScripts();

// Initialize after a short delay to ensure scripts are loaded
setTimeout(initializeMessagingLogModule, 500); 