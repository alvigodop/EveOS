// js/modules/gemini/agentic/Session_Controls_Agentic/Session_Controls_Agentic.js
// Loads and connects all session controls related functionality

console.log("js/modules/gemini/agentic/Session_Controls_Agentic/Session_Controls_Agentic.js started loading");

// Define the base path for session controls modules
const SESSION_CONTROLS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/agentic/sess_ctrl';

// List of session controls related scripts to load
const sessionControlsScripts = [
    `${SESSION_CONTROLS_BASE_PATH}/session_controls_settings/sessionControlsSettingsHandler.js?v=d014962dcfde`
];

function loadSessionControlsScripts() {
    return Promise.all(sessionControlsScripts.map(scriptPath => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptPath;
            script.defer = true;
            script.onload = () => {
                initializeSessionControlsModule();
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    })).then(() => {
        initializeSessionControlsModule();
        return window.SessionControlsAgentic;
    });
}

// Initialize session controls functionality after scripts load
function initializeSessionControlsModule() {
    if (!window.SessionControlsAgentic) {
        window.SessionControlsAgentic = {};
    }

    // Also expose functions directly on window for backward compatibility
    if (window.SessionControlsAgentic.initializeSessionControlsSettings) {
        window.initializeSessionControlsSettings = window.SessionControlsAgentic.initializeSessionControlsSettings;
    }
}

window.SessionControlsAgentic = window.SessionControlsAgentic || {};
window.SessionControlsAgentic.initializeSessionControlsSettings =
    window.SessionControlsAgentic.initializeSessionControlsSettings || null;
window.SessionControlsAgenticReady = loadSessionControlsScripts();
