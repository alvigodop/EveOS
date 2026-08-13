/**
 * This file aggregates the loading and initialization logic for Model Operations UI HTML components.
 */

// Define the base path for Model Operations UI HTML loaders
const MODEL_OPERATIONS_UI_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm/model_ops';

// List of individual UI loader scripts for Model Operations UI components
const modelOperationsUILoaderScripts = [
    `${MODEL_OPERATIONS_UI_HTML_LOADERS_BASE_PATH}/reinit_btn/reinitiateModelButtonUILoader.js?v=ca276cb7f837`,
    `${MODEL_OPERATIONS_UI_HTML_LOADERS_BASE_PATH}/new_chat_btn/newChatButtonUILoader.js?v=cc61e8a73c31`
    // Add other UI loader scripts for Model Operations UI components here in the future
];

/**
 * Dynamically loads the individual Model Operations UI loader scripts.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadModelOperationsUILoaderScripts() {
    console.log("model_operations_ui_html_loaders.js: Loading individual Model Operations UI loader scripts...");
    const promises = modelOperationsUILoaderScripts.map(scriptPath => {
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
 * Initializes the loading and setup of all Model Operations UI HTML components.
 */
async function initializeModelOperationsUIHtmlComponents() {
    console.log("model_operations_ui_html_loaders.js: initializeModelOperationsUIHtmlComponents started.");

    try {
        // First, dynamically load all the individual UI loader scripts
        await loadModelOperationsUILoaderScripts();
        console.log("model_operations_ui_html_loaders.js: All individual Model Operations UI loader scripts loaded.");

        // Now that the scripts are loaded and their functions are available on window,
        // call the load functions for each component.
        if (typeof window.loadReinitiateModelButtonCard === 'function') {
            await window.loadReinitiateModelButtonCard();
            console.log('Reinitiate Model Button HTML loaded.');
        } else {
            console.error('loadReinitiateModelButtonCard function not found after dynamic loading.');
        }

        // Load the New Chat Button
        if (typeof window.loadNewChatButtonCard === 'function') {
            await window.loadNewChatButtonCard();
            console.log('New Chat Button HTML loaded.');
        } else {
            console.error('loadNewChatButtonCard function not found after dynamic loading.');
        }

    } catch (error) {
        console.error("Error initializing Model Operations UI HTML components:", error);
    }

    console.log("model_operations_ui_html_loaders.js: initializeModelOperationsUIHtmlComponents finished.");
}

// Export the initialization function
window.initializeModelOperationsUIHtmlComponents = initializeModelOperationsUIHtmlComponents; 