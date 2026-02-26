// js/modules/gemini/agentic/AI_Self_Talk_Agentic/AI_Self_Talk_Agentic.js
// Loads and connects all AI self-talk related functionality

console.log("js/modules/gemini/agentic/AI_Self_Talk_Agentic/AI_Self_Talk_Agentic.js started loading");

// Initialize the AISelfTalkAgentic namespace
window.AISelfTalkAgentic = window.AISelfTalkAgentic || {};

// Define the base path for AI self-talk modules
const AI_SELF_TALK_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/agentic/self_talk';

// List of AI self-talk related scripts to load
const aiSelfTalkScripts = [
    // Core self-talk functionality
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/selfTalkState.js`,
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/selfTalkDefinitions.js`,
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/selfTalkExecution.js`,
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/selfTalkToggleHandler.js`,
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/selfTalkSettingsHandler.js`,
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/selfTalkUIInitialization.js`,
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/aiSelfTalkCoordinator.js`
];

// Load all AI self-talk related scripts
function loadAISelfTalkScripts() {
    const fragment = document.createDocumentFragment();
    aiSelfTalkScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Initialize the AI self-talk module
function initializeAISelfTalkModule() {
    // Initialize any required state or event listeners here
    console.log("Initializing AI Self Talk Agentic module...");

    // Set up initial state
    window.AISelfTalkAgentic = {
        ...window.AISelfTalkAgentic,
        isEnabled: false,           // Will be managed by aiSelfTalkManager.js
        initiateSelftalk: null,     // Will be defined by aiSelfTalkManager.js
        resetConsecutiveSelfTalks: null, // Will be defined by aiSelfTalkManager.js
        getState: null,             // Will be defined by aiSelfTalkManager.js
        systemMessage: "",          // Will be managed by aiSelfTalkManager.js
        selfTalkPrompt: ""          // Will be managed by aiSelfTalkManager.js
    };

    // Also expose functions directly on window for backward compatibility
    if (window.AISelfTalkAgentic.initiateSelftalk) {
        window.initiateSelftalk = window.AISelfTalkAgentic.initiateSelftalk;
    }
    if (window.AISelfTalkAgentic.resetConsecutiveSelfTalks) {
        window.resetConsecutiveSelfTalks = window.AISelfTalkAgentic.resetConsecutiveSelfTalks;
    }
    if (window.AISelfTalkAgentic.getState) {
        window.getAISelfTalkState = window.AISelfTalkAgentic.getState;
    }

    console.log("AI Self Talk Agentic module initialized");
}

// Load scripts
loadAISelfTalkScripts();

// Initialize after a short delay to ensure scripts are loaded
setTimeout(initializeAISelfTalkModule, 500);

console.log("js/modules/gemini/agentic/AI_Self_Talk_Agentic/AI_Self_Talk_Agentic.js finished loading and initial execution");

// Export AI self-talk related functions for global use
window.AISelfTalkAgentic = {
    isEnabled: false,           // Will be managed by aiSelfTalkManager.js
    initiateSelftalk: null,     // Will be defined by aiSelfTalkManager.js
    resetConsecutiveSelfTalks: null, // Will be defined by aiSelfTalkManager.js
    getState: null,             // Will be defined by aiSelfTalkManager.js
    systemMessage: "",          // Will be managed by aiSelfTalkManager.js
    selfTalkPrompt: ""          // Will be managed by aiSelfTalkManager.js
}; 