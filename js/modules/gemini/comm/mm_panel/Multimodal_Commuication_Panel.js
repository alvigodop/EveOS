// js/modules/gemini/comm/mm_panel/Multimodal_Commuication_Panel.js - Manages loading of Multimodal MM Communication Panel features

console.log("js/modules/gemini/comm/mm_panel/Multimodal_Commuication_Panel.js started loading");

// Initialize the MultimodalCommuicationPanel namespace
window.MultimodalCommuicationPanel = window.MultimodalCommuicationPanel || {};

// Define the base path for Multimodal Communication Panel modules
const MM_PANEL_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/mm_panel';

// List of Multimodal Communication Panel scripts to load
const mmPanelScriptsToLoad = [
    // Screen Share MM Communication Panel
    `${MM_PANEL_BASE_PATH}/scr_share/Screen_Share_MM_Commuication_Panel.js?v=6896906201c8`,

    // Voice Input MM Communication Panel
    `${MM_PANEL_BASE_PATH}/voice_input/Voice_Input_MM_Commuication_Panel.js?v=f935fadeaaec`
];

// Function to load all Multimodal Communication Panel scripts
function loadMMPanelScripts() {
    const fragment = document.createDocumentFragment();
    mmPanelScriptsToLoad.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        script.onload = initializeMMPanelModule;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Initialize Multimodal Communication Panel functionality after scripts load
function initializeMMPanelModule() {
    console.log("Initializing Multimodal Communication Panel module...");

    // Ensure the global namespace exists
    if (!window.MultimodalCommuicationPanel) {
        window.MultimodalCommuicationPanel = {
            ScreenShare: window.ScreenSharePanel || {},
            VoiceInput: window.VoiceInputPanel || {}
        };
    }

    console.log("Multimodal Communication Panel module initialized");
}

// Load scripts
loadMMPanelScripts();

// Initialize after a short delay to ensure scripts are loaded
setTimeout(initializeMMPanelModule, 500);

console.log("js/modules/gemini/comm/mm_panel/Multimodal_Commuication_Panel.js finished loading and initial execution");

// Export Multimodal Communication Panel related functions for global use
window.MultimodalCommuicationPanel = {
    ScreenShare: {},
    VoiceInput: {}
};
