/**
 * This file aggregates the loading and initialization logic for System Message Toggle UI HTML components.
 */

// Define the base path for System Message Toggle UI HTML loaders
const SYSTEM_MESSAGE_TOGGLE_UI_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm/sys_msg';

// List of individual UI loader scripts for System Message Toggle UI components
const systemMessageToggleUILoaderScripts = [
    `${SYSTEM_MESSAGE_TOGGLE_UI_HTML_LOADERS_BASE_PATH}/toggle_sw/systemMessageToggleSwitchUILoader.js`
    // Add other UI loader scripts for System Message Toggle UI components here in the future
];

/**
 * Dynamically loads the individual System Message Toggle UI loader scripts.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadSystemMessageToggleUILoaderScripts() {
    console.log("system_message_toggle_ui_html_loaders.js: Loading individual System Message Toggle UI loader scripts...");
    const promises = systemMessageToggleUILoaderScripts.map(scriptPath => {
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
 * Initializes the loading and setup of all System Message Toggle UI HTML components.
 */
async function initializeSystemMessageToggleUIHtmlComponents() {
    console.log("system_message_toggle_ui_html_loaders.js: initializeSystemMessageToggleUIHtmlComponents started.");

    try {
        // First, dynamically load all the individual UI loader scripts
        await loadSystemMessageToggleUILoaderScripts();
        console.log("system_message_toggle_ui_html_loaders.js: All individual System Message Toggle UI loader scripts loaded.");

        // Now that the scripts are loaded and their functions are available on window,
        // call the load functions for each component.
        if (typeof window.loadSystemMessageToggleSwitch === 'function') {
            await window.loadSystemMessageToggleSwitch();
            console.log('System Message Toggle Switch HTML loaded.');
        } else {
            console.error('loadSystemMessageToggleSwitch function not found after dynamic loading.');
        }

    } catch (error) {
        console.error("Error initializing System Message Toggle UI HTML components:", error);
    }

    console.log("system_message_toggle_ui_html_loaders.js: initializeSystemMessageToggleUIHtmlComponents finished.");
}

// Export the initialization function
window.initializeSystemMessageToggleUIHtmlComponents = initializeSystemMessageToggleUIHtmlComponents; 