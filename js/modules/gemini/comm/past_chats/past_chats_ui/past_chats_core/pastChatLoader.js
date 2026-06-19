/**
 * pastChatLoader.js
 * Dynamically loads the core modules for Past Chats UI.
 */

const PAST_CHATS_CORE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/past_chats/past_chats_ui/past_chats_core';

const pastChatsScripts = [
    `${PAST_CHATS_CORE_PATH}/pastChatRenderer.js`,
    `${PAST_CHATS_CORE_PATH}/pastChatActionHandler.js?v=0.1.1`
];

function loadPastChatsScripts() {
    pastChatsScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.async = false; // Load in order
        document.head.appendChild(script);
        console.log(`Loading script: ${scriptPath}`);
    });
}

// Initiate loading
loadPastChatsScripts();

console.log("pastChatLoader.js finished.");
