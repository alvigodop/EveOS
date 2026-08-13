/**
 * chatClearHandler.js
 * Refactored to use modular components in chat_clearing_core/
 * Acts as a loader and bridge for backward compatibility.
 */

// Load the core scripts
const loaderScript = document.createElement('script');
loaderScript.src = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/clear_chat/chat_clearing_operations/chat_clearing_core/chatClearLoader.js?v=3a3ee2204766';
document.head.appendChild(loaderScript);

// Bridge functions for backward compatibility with inline HTML onclicks 
// and to expose the main entry point 'clearChat'
function clearChat() {
    if (window.ChatClearing && window.ChatClearing.UI) {
        window.ChatClearing.UI.openDialog();
    } else {
        console.warn("ChatClearing.UI not loaded yet.");
    }
}

// Ensure these global functions exist because they might be referenced by the dialog HTML 
// if the dialog was created by the old code or if other parts of the app rely on them.
// The new UI uses `window.ChatClearing.Logic.clear...` but we keep these as fail-safes or aliases.

window.closeDialog = function () {
    if (window.ChatClearing && window.ChatClearing.UI) {
        window.ChatClearing.UI.closeDialog();
    }
};

window.clearCurrentChat = function () {
    if (window.ChatClearing && window.ChatClearing.Logic) {
        window.ChatClearing.Logic.clearCurrentChat();
    }
};

window.clearPastChats = function () {
    if (window.ChatClearing && window.ChatClearing.Logic) {
        window.ChatClearing.Logic.clearPastChats();
    }
};

window.clearAllChats = function () {
    if (window.ChatClearing && window.ChatClearing.Logic) {
        window.ChatClearing.Logic.clearAllChats();
    }
};


/**
 * Initializes the Clear Chat button handler.
 * This function is called by the HTML loader after the clear chat button is loaded into the DOM.
 */
function initializeClearChatHandler() {
    const clearChatButton = document.getElementById('clearChatButton');
    if (clearChatButton) {
        if (clearChatButton.dataset.clearChatBound === '1') return;
        clearChatButton.dataset.clearChatBound = '1';
        // Redundant check for clearChat function existence isn't strictly necessary 
        // since we defined it above, but good for safety.
        clearChatButton.addEventListener('click', clearChat);
        console.log('Clear Chat button event listener attached successfully.');
    } else {
        console.error('clearChatButton not found when initializing Clear Chat handler.');
    }
}

// Expose the initialization function via the CommunicationPanel namespace
if (!window.CommunicationPanel) {
    window.CommunicationPanel = {};
}
if (!window.CommunicationPanel.ClearChatCommunicationPanel) {
    window.CommunicationPanel.ClearChatCommunicationPanel = {};
}
window.CommunicationPanel.ClearChatCommunicationPanel.initializeClearChatHandler = initializeClearChatHandler;

console.log("chatClearHandler.js (Bridge) loaded.");
