// js/modules/gemini/comm/Communication_Panel.js
// Loads and connects all Communication Panel modules
// Script loading is now handled by js/modules/gemini/Script_Loader/Script_Loader.js

// Initialize Communication Panel functionality after scripts load
function initializeCommunicationPanelModule() {
    console.log("Initializing Communication Panel module...");
    if (!window.CommunicationPanel) {
        window.CommunicationPanel = {
            MultimodalPanel: window.MultimodalCommunicationPanel || {},
            StartNewChatPanel: window.StartNewChatPanel || {},
            // SendChatHistoryPanel: window.SendChatHistoryPanel || {},
            ClearChatPanel: window.ClearChatPanel || {},
            ClearSystemLogPanel: window.ClearSystemLogPanel || {},
            TogglePastChatsPanel: window.TogglePastChatsPanel || {},
            SystemMessageTogglePanel: window.SystemMessageTogglePanel || {},
            // ToggleConversationHistoryPanel: window.ToggleConversationHistoryPanel || {},
            ReinitiateModelPanel: window.ReinitiateModelPanel || {}
        };
    }
    console.log("Communication Panel module initialized");
}

// Export Communication Panel functions for global use
window.CommunicationPanel = {
    MultimodalPanel: {},
    StartNewChatPanel: {},
    // SendChatHistoryPanel: {},
    ClearChatPanel: {},
    ClearSystemLogPanel: {},
    TogglePastChatsPanel: {},
    SystemMessageTogglePanel: {},
    // ToggleConversationHistoryPanel: {},
    ReinitiateModelPanel: {}
};

// Initialize after delay
setTimeout(initializeCommunicationPanelModule, 500); 