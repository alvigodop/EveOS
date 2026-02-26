/**
 * This file aggregates the loading and initialization logic for Clear System Log UI HTML components.
 */

// Define the base path for Clear System Log UI HTML loaders
const CLEAR_SYSTEM_LOG_UI_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm/clear_sys';

// List of individual UI loader scripts for Clear System Log UI components
const clearSystemLogUILoaderScripts = [
    `${CLEAR_SYSTEM_LOG_UI_HTML_LOADERS_BASE_PATH}/clear_btn/clearSystemLogButtonUILoader.js`
    // Add other UI loader scripts for Clear System Log UI components here in the future
];

/**
 * Dynamically loads the individual Clear System Log UI loader scripts.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadClearSystemLogUILoaderScripts() {
    console.log("clear_system_log_ui_html_loaders.js: Loading individual Clear System Log UI loader scripts...");
    const promises = clearSystemLogUILoaderScripts.map(scriptPath => {
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
 * Initializes the loading and setup of all Clear System Log UI HTML components.
 */
async function initializeClearSystemLogUIHtmlComponents() {
    console.log("clear_system_log_ui_html_loaders.js: initializeClearSystemLogUIHtmlComponents started.");

    try {
        // First, dynamically load all the individual UI loader scripts
        await loadClearSystemLogUILoaderScripts();
        console.log("clear_system_log_ui_html_loaders.js: All individual Clear System Log UI loader scripts loaded.");

        // Now that the scripts are loaded and their functions are available on window,
        // call the load functions for each component.
        if (typeof window.loadClearSystemLogButton === 'function') {
            await window.loadClearSystemLogButton();
            console.log('Clear System Log Button HTML loaded.');
        } else {
            console.error('loadClearSystemLogButton function not found after dynamic loading.');
        }

    } catch (error) {
        console.error("Error initializing Clear System Log UI HTML components:", error);
    }

    console.log("clear_system_log_ui_html_loaders.js: initializeClearSystemLogUIHtmlComponents finished.");
}

// Export the initialization function
window.initializeClearSystemLogUIHtmlComponents = initializeClearSystemLogUIHtmlComponents; 