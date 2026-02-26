/**
 * This file aggregates the loading and initialization logic for Clear Chat UI HTML components.
 */

// Define the base path for Clear Chat UI HTML loaders
const CLEAR_CHAT_UI_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm/clear_chat';

// List of individual UI loader scripts for Clear Chat UI components
const clearChatUILoaderScripts = [
    `${CLEAR_CHAT_UI_HTML_LOADERS_BASE_PATH}/clear_btn/clearChatButtonUILoader.js`
    // Add other UI loader scripts for Clear Chat UI components here in the future
];

/**
 * Dynamically loads the individual Clear Chat UI loader scripts.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadClearChatUILoaderScripts() {
    console.log("clear_chat_ui_html_loaders.js: Loading individual Clear Chat UI loader scripts...");
    const promises = clearChatUILoaderScripts.map(scriptPath => {
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
 * Initializes the loading and setup of all Clear Chat UI HTML components.
 */
async function initializeClearChatUIHtmlComponents() {
    console.log("clear_chat_ui_html_loaders.js: initializeClearChatUIHtmlComponents started.");

    try {
        // First, dynamically load all the individual UI loader scripts
        await loadClearChatUILoaderScripts();
        console.log("clear_chat_ui_html_loaders.js: All individual Clear Chat UI loader scripts loaded.");

        // Now that the scripts are loaded and their functions are available on window,
        // call the load functions for each component.
        if (typeof window.loadClearChatButton === 'function') {
            await window.loadClearChatButton();
            console.log('Clear Chat Button HTML loaded.');
        } else {
            console.error('loadClearChatButton function not found after dynamic loading.');
        }

    } catch (error) {
        console.error("Error initializing Clear Chat UI HTML components:", error);
    }

    console.log("clear_chat_ui_html_loaders.js: initializeClearChatUIHtmlComponents finished.");
}

// Export the initialization function
window.initializeClearChatUIHtmlComponents = initializeClearChatUIHtmlComponents; 