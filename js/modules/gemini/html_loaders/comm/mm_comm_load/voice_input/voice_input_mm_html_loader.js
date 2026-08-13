/**
 * This file aggregates the loading and initialization logic for Voice Input MM UI HTML components.
 */

// Define the base path for Voice Input MM UI HTML loaders
const VOICE_INPUT_MM_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm/mm_comm_load/voice_input';

// List of individual UI loader scripts for Voice Input MM components
const voiceInputMMUILoaderScripts = [
    `${VOICE_INPUT_MM_HTML_LOADERS_BASE_PATH}/btn/startButtonUILoader.js?v=3875d1671528`,
    `${VOICE_INPUT_MM_HTML_LOADERS_BASE_PATH}/btn/stopButtonUILoader.js?v=455f8dbf736c`
];

/**
 * Dynamically loads the individual Voice Input MM UI loader scripts.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadVoiceInputMMUILoaderScripts() {
    console.log("voice_input_mm_html_loader.js: Loading individual Voice Input MM UI loader scripts...");
    const promises = voiceInputMMUILoaderScripts.map(scriptPath => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptPath;
            script.defer = true; // Ensure scripts are executed in order after fetching
            script.onload = () => {
                console.log(`${scriptPath} loaded.`);
                resolve();
            };
            script.onerror = (error) => {
                console.error(`Failed to load ${scriptPath}:`, error);
                reject(error);
            };
            document.body.appendChild(script);
        });
    });
    return Promise.all(promises);
}

/**
 * Initializes the loading and setup of all Voice Input MM UI HTML components.
 */
async function initializeVoiceInputMMHtmlComponents() {
    console.log("voice_input_mm_html_loader.js: initializeVoiceInputMMHtmlComponents started.");

    try {
        await loadVoiceInputMMUILoaderScripts();
        console.log("voice_input_mm_html_loader.js: All individual Voice Input MM UI loader scripts loaded.");

        if (typeof window.loadStartButton === 'function') {
            await window.loadStartButton();
            console.log('Start Button HTML loaded.');
        } else {
            console.error('loadStartButton function not found after dynamic loading.');
        }

        if (typeof window.loadStopButton === 'function') {
            await window.loadStopButton();
            console.log('Stop Button HTML loaded.');
        } else {
            console.error('loadStopButton function not found after dynamic loading.');
        }

        // Initialize the voice input button handlers after both buttons are loaded
        if (window.CommunicationPanel &&
            window.CommunicationPanel.MultimodalCommunicationPanel &&
            window.CommunicationPanel.MultimodalCommunicationPanel.VoiceInputMMCommunicationPanel &&
            window.CommunicationPanel.MultimodalCommunicationPanel.VoiceInputMMCommunicationPanel.VoiceInputButtonHandlers &&
            typeof window.CommunicationPanel.MultimodalCommunicationPanel.VoiceInputMMCommunicationPanel.VoiceInputButtonHandlers.initializeVoiceInputButtonHandlers === 'function') {

            window.CommunicationPanel.MultimodalCommunicationPanel.VoiceInputMMCommunicationPanel.VoiceInputButtonHandlers.initializeVoiceInputButtonHandlers();
            console.log('Voice input button handlers initialized.');
        } else {
            console.error('VoiceInputMMCommunicationPanel namespace or initializeVoiceInputButtonHandlers function not found after loading handler script.');
        }

    } catch (error) {
        console.error("Error initializing Voice Input MM UI HTML components:", error);
    }

    console.log("voice_input_mm_html_loader.js: initializeVoiceInputMMHtmlComponents finished.");
}

// Export the initialization function
window.initializeVoiceInputMMHtmlComponents = initializeVoiceInputMMHtmlComponents;
