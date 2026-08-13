/**
 * chatClearLoader.js
 * Dynamically loads the core modules for Chat Clearing UI and Logic.
 */

const CHAT_CLEARING_CORE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/clear_chat/chat_clearing_operations/chat_clearing_core';

const chatClearingScripts = [
    `${CHAT_CLEARING_CORE_PATH}/chatClearUI.js?v=dffc0b9e5ae6`,
    `${CHAT_CLEARING_CORE_PATH}/chatClearLogic.js?v=1caf2926a80e`
];

function loadChatClearingScripts() {
    chatClearingScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.async = false; // Load in order
        document.head.appendChild(script);
        console.log(`Loading script: ${scriptPath}`);
    });
}

// Initiate loading
loadChatClearingScripts();

console.log("chatClearLoader.js finished.");
