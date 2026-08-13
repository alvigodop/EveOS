/**
 * This file aggregates the loading and initialization logic for Past Chats UI HTML components.
 */

// Define the base path for Past Chats UI HTML loaders
const PAST_CHATS_UI_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm/past_chats';

// List of individual UI loader scripts for Past Chats UI components
const pastChatsUILoaderScripts = [
    `${PAST_CHATS_UI_HTML_LOADERS_BASE_PATH}/toggle_btn/togglePastChatsButtonUILoader.js?v=9bb28051ab84`
    // Add other UI loader scripts for Past Chats UI components here in the future
];

/**
 * Dynamically loads the individual Past Chats UI loader scripts.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadPastChatsUILoaderScripts() {
    console.log("past_chats_ui_html_loaders.js: Loading individual Past Chats UI loader scripts...");
    const promises = pastChatsUILoaderScripts.map(scriptPath => {
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
 * Initializes the loading and setup of all Past Chats UI HTML components.
 */
async function initializePastChatsUIHtmlComponents() {
    console.log("past_chats_ui_html_loaders.js: initializePastChatsUIHtmlComponents started.");

    try {
        // First, dynamically load all the individual UI loader scripts
        await loadPastChatsUILoaderScripts();
        console.log("past_chats_ui_html_loaders.js: All individual Past Chats UI loader scripts loaded.");

        // Now that the scripts are loaded and their functions are available on window,
        // call the load functions for each component.
        if (typeof window.loadTogglePastChatsButton === 'function') {
            await window.loadTogglePastChatsButton();
            console.log('Toggle Past Chats Button HTML loaded.');
        } else {
            console.error('loadTogglePastChatsButton function not found after dynamic loading.');
        }

    } catch (error) {
        console.error("Error initializing Past Chats UI HTML components:", error);
    }

    console.log("past_chats_ui_html_loaders.js: initializePastChatsUIHtmlComponents finished.");
}

// Export the initialization function
window.initializePastChatsUIHtmlComponents = initializePastChatsUIHtmlComponents; 