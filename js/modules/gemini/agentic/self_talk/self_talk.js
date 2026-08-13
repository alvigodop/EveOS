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
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/selfTalkState.js?v=d66f87c6eacc`,
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/selfTalkDefinitions.js?v=275891a5993d`,
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/selfTalkExecution.js?v=48c10d5b775b`,
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/selfTalkToggleHandler.js?v=83d358572fc1`,
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/selfTalkSettingsHandler.js?v=fa8f48a0fafc`,
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/selfTalkUIInitialization.js?v=e24f53d8fe5c`,
    `${AI_SELF_TALK_BASE_PATH}/ai_self_talk_features/ai_self_talk_core/aiSelfTalkCoordinator.js?v=d5bfddd26418`
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
