// js/modules/gemini/Messaging_Log/Messaging_Log.js - Loads all modularized JavaScript files for Messaging Log features

console.log("js/modules/gemini/Log_Interface_Display/Messaging_Log/Messaging_Log.js started loading");

// Initialize the MessagingLog namespace
window.MessagingLog = window.MessagingLog || {};

// Define the base path for Messaging Log modules
const MESSAGING_LOG_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/logs/msg_log';

// List of Messaging Log scripts to load
// List of Messaging Log scripts to load
const messagingLogScripts = [
    `${MESSAGING_LOG_BASE_PATH}/msg_disp/messaging_ui_core/messagingUiLoader.js?v=7863278d5dff`,
    `${MESSAGING_LOG_BASE_PATH}/msg_disp/audio_player/audioPlayerComponentCreator.js?v=c060d0bed766`,
    `${MESSAGING_LOG_BASE_PATH}/msg_disp/audio_player/audioAutoPlayHandler.js?v=8f07713e242b`,
    `${MESSAGING_LOG_BASE_PATH}/msg_disp/audio_player/audioPlayerEventHandler.js?v=53e2b4e7ce27`,
    `${MESSAGING_LOG_BASE_PATH}/msg_disp/incomingMessageHandler.js?v=c541e16fa11e`,
    `${MESSAGING_LOG_BASE_PATH}/msg_disp/messageDisplayHandler.js?v=e8cbea78c75c`,
    `${MESSAGING_LOG_BASE_PATH}/message_counting/messageCounter.js?v=aca5eaa37845`
];

let messagingLogScriptsSettled = 0;
let messagingLogInitialized = false;

function settleMessagingLogScript(scriptPath, loaded) {
    messagingLogScriptsSettled += 1;
    if (!loaded) console.error(`Messaging Log dependency failed to load: ${scriptPath}`);
    if (messagingLogScriptsSettled === messagingLogScripts.length) initializeMessagingLogModule();
}

// Load all Messaging Log scripts
function loadMessagingLogScripts() {
    const fragment = document.createDocumentFragment();
    messagingLogScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.async = false;
        script.onload = () => settleMessagingLogScript(scriptPath, true);
        script.onerror = () => settleMessagingLogScript(scriptPath, false);
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Initialize Messaging Log functionality after scripts load
function initializeMessagingLogModule() {
    if (messagingLogInitialized) return true;

    if (typeof showIncomingMessage !== 'function' || typeof displayMessage !== 'function') {
        console.error('Messaging Log could not initialize because required handlers are unavailable.');
        return false;
    }

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

    messagingLogInitialized = true;
    window.MessagingLog.initialized = true;
    console.log("Messaging Log module initialized");
    return true;
}

// Load scripts
loadMessagingLogScripts();
