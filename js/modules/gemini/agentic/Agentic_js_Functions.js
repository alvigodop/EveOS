// js/modules/gemini/agentic/Agentic_js_Functions.js
// Aggregates all agentic function modules
// Script loading is now handled by js/modules/gemini/Script_Loader/Script_Loader.js

console.log("js/modules/gemini/agentic/Agentic_js_Functions.js started loading");
// Initialize Agentic functionality after scripts load
function initializeAgenticModule() {
    if (!window.AgenticFunctions) {
        window.AgenticFunctions = {
            TimePerception: window.TimePerceptionAgentic || {},
            ConversationMemory: window.ConversationMemoryAgentic || {},
            AISelfTalk: window.AISelfTalkAgentic || {},
            AudioProcessingControls: window.AudioProcessingControlsAgentic || {},
            SessionControls: window.SessionControlsAgentic || {},
            ScreenCaptureInterval: window.ScreenCaptureIntervalAgentic || {}
        };
    }
}

// Export Agentic functions for global use
window.AgenticFunctions = {
    TimePerception: {},
    ConversationMemory: {},
    AISelfTalk: {},
    AudioProcessingControls: {},
    SessionControls: {},
    ScreenCaptureInterval: {}
};

// Initialize Agentic functionality (using the same pattern as before, likely relying on window load or deferred execution)
// Since the scripts are now loaded by Script_Loader, we can run this initialization when appropriate.
// Keeping it simple and safe:
setTimeout(initializeAgenticModule, 500);
