// js/modules/gemini/comm/Communication_Panel.js
// Loads and connects all Communication Panel modules
// Script loading is now handled by js/modules/gemini/Script_Loader/Script_Loader.js

// Initialize Communication Panel functionality after scripts load
function initializeCommunicationPanelModule() {
    console.log("Initializing Communication Panel module...");
    const panel = window.CommunicationPanel = window.CommunicationPanel || {};
    panel.MultimodalPanel = panel.MultimodalPanel || window.MultimodalCommunicationPanel || {};
    panel.StartNewChatPanel = panel.StartNewChatPanel || window.StartNewChatPanel || {};
    panel.ClearChatPanel = panel.ClearChatPanel || window.ClearChatPanel || {};
    panel.ClearSystemLogPanel = panel.ClearSystemLogPanel || window.ClearSystemLogPanel || {};
    panel.TogglePastChatsPanel = panel.TogglePastChatsPanel || window.TogglePastChatsPanel || {};
    panel.SystemMessageTogglePanel = panel.SystemMessageTogglePanel || window.SystemMessageTogglePanel || {};
    panel.ReinitiateModelPanel = panel.ReinitiateModelPanel || window.ReinitiateModelPanel || {};
    console.log("Communication Panel module initialized");
}

// Export Communication Panel functions for global use
initializeCommunicationPanelModule();

// Initialize after delay
setTimeout(initializeCommunicationPanelModule, 500);
