/**
 * This file aggregates the loading and initialization logic for Multimodal Communication UI HTML components.
 */

// Define the base path for Multimodal Communication UI HTML loaders
const MULTIMODAL_COMMUNICATION_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm/mm_comm_load';

// List of individual UI loader scripts for Multimodal Communication components
const multimodalCommunicationUILoaderScripts = [
    `${MULTIMODAL_COMMUNICATION_HTML_LOADERS_BASE_PATH}/scr_share/screen_share_mm_html_loaders.js`,
    `${MULTIMODAL_COMMUNICATION_HTML_LOADERS_BASE_PATH}/voice_input/voice_input_mm_html_loader.js`
];

/**
 * Dynamically loads the individual Multimodal Communication UI loader scripts.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadMultimodalCommunicationUILoaderScripts() {
    console.log("multimodal_communication_html_loaders.js: Loading individual Multimodal Communication UI loader scripts...");
    const promises = multimodalCommunicationUILoaderScripts.map(scriptPath => {
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
 * Initializes the loading and setup of all Multimodal Communication UI HTML components.
 */
async function initializeMultimodalCommunicationHtmlComponents() {
    console.log("multimodal_communication_html_loaders.js: initializeMultimodalCommunicationHtmlComponents started.");

    try {
        await loadMultimodalCommunicationUILoaderScripts();
        console.log("multimodal_communication_html_loaders.js: All individual Multimodal Communication UI loader scripts loaded.");

        // Initialize Screen Share MM components
        if (typeof window.initializeUiComponentHtmlComponents === 'function') {
            await window.initializeUiComponentHtmlComponents(); // This was the old name from screen_share_mm_html_loaders.js
            console.log('Screen Share MM HTML Components initialized.');
        } else {
            console.error('initializeUiComponentHtmlComponents function for Screen Share MM not found after dynamic loading.');
        }

        // Initialize Voice Input MM components
        if (typeof window.initializeVoiceInputMMHtmlComponents === 'function') {
            await window.initializeVoiceInputMMHtmlComponents();
            console.log('Voice Input MM HTML Components initialized.');
        } else {
            console.error('initializeVoiceInputMMHtmlComponents for Voice Input MM not found after dynamic loading.');
        }

    } catch (error) {
        console.error("Error initializing Multimodal Communication UI HTML components:", error);
    }

    console.log("multimodal_communication_html_loaders.js: initializeMultimodalCommunicationHtmlComponents finished.");
}

// Export the initialization function
window.initializeMultimodalCommunicationHtmlComponents = initializeMultimodalCommunicationHtmlComponents;
