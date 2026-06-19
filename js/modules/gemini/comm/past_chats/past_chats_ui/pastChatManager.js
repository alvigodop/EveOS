/**
 * pastChatManager.js
 * acts as a bridge and initializer for the Past Chats UI.
 * Refactored to use modular components in past_chats_core/
 */

console.log("Started loading: pastChatManager.js");

// Load the core scripts
try {
    const loaderScript = document.createElement('script');
    loaderScript.src = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/past_chats/past_chats_ui/past_chats_core/pastChatLoader.js?v=0.1.1';
    loaderScript.onerror = function () { console.error("Failed to load pastChatLoader.js"); };
    loaderScript.onload = function () { console.log("pastChatLoader.js loaded via pastChatManager.js"); };
    document.head.appendChild(loaderScript);
} catch (e) {
    console.error("Error invoking pastChatLoader:", e);
}

/**
 * Global function to move functionality to the new modular structure
 * while keeping legacy calls working if they exist in HTML onlick attributes.
 */
window.updatePastChatsDisplay = function () {
    console.log("updatePastChatsDisplay called");
    if (window.PastChatsUI && window.PastChatsUI.Renderer) {
        // Assume 'pastChats' global variable exists as before (now safely on window)
        if (typeof window.pastChats !== 'undefined') {
            window.PastChatsUI.Renderer.updateDisplay(window.pastChats);
        } else {
            console.warn("Global 'window.pastChats' variable not found.");
        }
    } else {
        console.warn("PastChatsUI.Renderer not loaded yet. Retrying in 100ms...");
        setTimeout(() => window.updatePastChatsDisplay(), 100);
    }
};

window.deletePastChat = function (index) {
    if (window.PastChatsUI && window.PastChatsUI.Actions) {
        window.PastChatsUI.Actions.deleteChat(index);
    } else {
        console.warn("PastChatsUI.Actions not loaded yet.");
    }
};

window.loadPastChat = function (index) {
    if (window.PastChatsUI && window.PastChatsUI.Actions) {
        window.PastChatsUI.Actions.loadChat(index);
    } else {
        console.warn("PastChatsUI.Actions not loaded yet.");
    }
};

console.log("pastChatManager.js (Bridge) loaded and functions exposed to window.");
