/**
 * This file acts as the entry point for the Communication Panel UI HTML loaders.
 * It loads the configuration, script loader, and component initializer modules,
 * and then exposes the main initialization function.
 */

// Function to load a script dynamically
function loadModule(scriptPath) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        // script.async = false; // Optional, but defer handles order usually. 
        // Using Promise to ensure sequential loading if await is used.
        script.onload = () => {
            console.log(`Module loaded: ${scriptPath}`);
            resolve();
        };
        script.onerror = (error) => {
            console.error(`Failed to load module: ${scriptPath}`, error);
            reject(error);
        };
        document.body.appendChild(script);
    });
}

// Base path for modules (same directory as this file)
const COMMUNICATION_PANEL_MODULE_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm';

/**
 * Initializes the loading and setup of all Communication Panel UI HTML components.
 * This is the public API called by pageInitializer.js.
 */
async function initializeCommunicationPanelHtmlComponents() {
    console.log("comm.js: Bootstrapping Communication Panel modules...");

    try {
        // Load modules sequentially to ensure dependencies are met
        // Load the config first
        await loadModule(`${COMMUNICATION_PANEL_MODULE_BASE_PATH}/communicationPanelLoaderConfig.js?v=8e5ef6c36372`);

        // Load the script loader next
        await loadModule(`${COMMUNICATION_PANEL_MODULE_BASE_PATH}/communicationPanelScriptLoader.js?v=160ce0539ae1`);

        // Load the component initializer last
        await loadModule(`${COMMUNICATION_PANEL_MODULE_BASE_PATH}/communicationPanelComponentInitializer.js?v=eb136fb4dfea`);

        console.log("comm.js: Modules loaded. Delegating initialization...");

        // Delegate to the actual initializer from the loaded module
        if (window.initializeCommunicationPanelComponents) {
            await window.initializeCommunicationPanelComponents();
        } else {
            console.error("window.initializeCommunicationPanelComponents not found after loading modules!");
        }

    } catch (error) {
        console.error("Error bootstrapping Communication Panel:", error);
    }
}

// Export the initialization function to be called by html_initialization_loaders.js
window.initializeCommunicationPanelHtmlComponents = initializeCommunicationPanelHtmlComponents;
