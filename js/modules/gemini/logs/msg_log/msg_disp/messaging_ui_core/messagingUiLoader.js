/**
 * messagingUiLoader.js
 * Loads core UI components for messaging.
 */

console.log("messagingUiLoader.js loading...");

const MESSAGING_UI_CORE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/logs/msg_log/msg_disp/messaging_ui_core';

const messagingUiScripts = [
    `${MESSAGING_UI_CORE_PATH}/messageUiCreator.js?v=c0e5312fb0c8`,
    `${MESSAGING_UI_CORE_PATH}/systemMessageDisplayHandler.js?v=490ea30eddb6`
];

function loadMessagingUiScripts() {
    const fragment = document.createDocumentFragment();
    messagingUiScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
    console.log("Messaging UI core scripts loaded.");
}

loadMessagingUiScripts();
