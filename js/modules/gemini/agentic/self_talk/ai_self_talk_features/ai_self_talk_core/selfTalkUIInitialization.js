/**
 * selfTalkUIInitialization.js
 * Orchestrates the initialization of AI Self-Talk UI components.
 * Delegates actual logic to `selfTalkToggleHandler.js?v=83d358572fc1` and `selfTalkSettingsHandler.js?v=fa8f48a0fafc`.
 */

window.AiSelfTalkAgentic = window.AiSelfTalkAgentic || {};
window.AiSelfTalkAgentic.UI = window.AiSelfTalkAgentic.UI || {};

window.AiSelfTalkAgentic.UI.initializeAiSelfTalk = function () {
    console.log("Initializing AI Self-talk feature.");

    // Initialize the Toggle Handler (Core Toggle + Heartbeat)
    if (window.AiSelfTalkAgentic.UI.initializeToggleHandler) {
        window.AiSelfTalkAgentic.UI.initializeToggleHandler();
    } else {
        console.error("selfTalkToggleHandler.js not loaded or initializeToggleHandler missing.");
    }

    // Initialize the Settings Handler (Dialog + Inputs)
    if (window.AiSelfTalkAgentic.UI.initializeSettingsHandler) {
        window.AiSelfTalkAgentic.UI.initializeSettingsHandler();
    } else {
        console.error("selfTalkSettingsHandler.js not loaded or initializeSettingsHandler missing.");
    }

    console.log("AI Self-talk feature initialization complete.");
};

console.log("selfTalkUIInitialization.js loaded.");
