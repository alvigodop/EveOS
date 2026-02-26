// js/modules/gemini/agentic/Time_Perception_Agentic/Time_Perception_Agentic.js
console.log("js/modules/gemini/agentic/Time_Perception_Agentic/Time_Perception_Agentic.js started loading");
// Loads and connects all time perception related functionality

// Define the base path for time perception modules
const TIME_PERCEPTION_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/agentic/time_perc';

// List of time perception related scripts to load
const timePerceptionScripts = [
    `${TIME_PERCEPTION_BASE_PATH}/time_perception/timeDisplayManager.js`,
    `${TIME_PERCEPTION_BASE_PATH}/time_formatters/timeFormatter.js`,
    `${TIME_PERCEPTION_BASE_PATH}/timestamp_parser/timestampParser.js`
];

// Load all time perception related scripts
function loadTimePerceptionScripts() {
    const fragment = document.createDocumentFragment();
    timePerceptionScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        script.onload = initializeTimePerceptionModule;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Initialize time perception functionality after scripts load
function initializeTimePerceptionModule() {
    if (!window.TimePerceptionAgentic) {
        window.TimePerceptionAgentic = {};
    }

    // Also expose functions directly on window for backward compatibility
    if (window.TimePerceptionAgentic.isTimePerceptionEnabled) {
        window.isTimePerceptionEnabled = window.TimePerceptionAgentic.isTimePerceptionEnabled;
    }
    if (window.TimePerceptionAgentic.formatTime) {
        window.formatTime = window.TimePerceptionAgentic.formatTime;
    }
    if (window.TimePerceptionAgentic.parseTimestamp) {
        window.parseTimestamp = window.TimePerceptionAgentic.parseTimestamp;
    }
}

// Initialize time perception functionality
loadTimePerceptionScripts();

// Export time perception related functions for global use
window.TimePerceptionAgentic = {
    formatTime: null,           // Will be defined by timeFormatter.js
    parseTimestamp: null,       // Will be defined by timestampParser.js
    isTimePerceptionEnabled: null // Will be defined by timeDisplayManager.js
}; 