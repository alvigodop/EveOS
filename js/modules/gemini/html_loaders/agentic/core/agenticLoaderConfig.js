/**
 * agenticLoaderConfig.js
 * Configuration for agentic HTML loaders path and scripts list.
 */

// Define the base path for agentic HTML loaders
// Note: This needs to be relative to where the index.html is or absolute from web root
const AGENTIC_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/agentic';

// List of individual agentic UI loader scripts
const agenticUILoaderScripts = [
    `${AGENTIC_HTML_LOADERS_BASE_PATH}/time_perc/timePerceptionUILoader.js`,
    `${AGENTIC_HTML_LOADERS_BASE_PATH}/conv_mem/conversationMemoryUILoader.js`,
    `${AGENTIC_HTML_LOADERS_BASE_PATH}/gemini_link/geminiLiveLinkScopeRuntime.js?v=0.2.1`,
    `${AGENTIC_HTML_LOADERS_BASE_PATH}/gemini_link/geminiLiveLinkUILoader.js?v=0.4.5`,
    `${AGENTIC_HTML_LOADERS_BASE_PATH}/gemini_link/geminiLiveLinkAssistRuntime.js?v=0.2.0`,
    `${AGENTIC_HTML_LOADERS_BASE_PATH}/audio_proc/audioProcessingControlsUILoader.js`,
    `${AGENTIC_HTML_LOADERS_BASE_PATH}/audio_proc/audioSettingsDialogUILoader.js`,
    `${AGENTIC_HTML_LOADERS_BASE_PATH}/sess_ctrl/sessionControlsUILoader.js?v=0.2.2`,
    `${AGENTIC_HTML_LOADERS_BASE_PATH}/scr_cap/screenCaptureSettingsUILoader.js?v=0.3.0`,
    `${AGENTIC_HTML_LOADERS_BASE_PATH}/self_talk/aiSelfTalkUILoader.js`,
    `${AGENTIC_HTML_LOADERS_BASE_PATH}/self_talk/aiSelfTalkSettingsDialogUILoader.js`
];

// Export to global scope if needed for other modules, though primarily used by scriptLoader
window.AgenticLoaderConfig = {
    BASE_PATH: AGENTIC_HTML_LOADERS_BASE_PATH,
    SCRIPTS: agenticUILoaderScripts
};

console.log("agenticLoaderConfig.js loaded.");
