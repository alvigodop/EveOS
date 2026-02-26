/**
 * Handles dynamic script loading for Communication Panel components.
 * Depends on communicationPanelLoaderConfig.js
 */

/**
 * Dynamically loads the individual Communication Panel UI loader aggregator scripts.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadCommunicationPanelUILoaderAggregatorScripts() {
    console.log("communicationPanelScriptLoader.js: Loading individual Communication Panel UI loader aggregator scripts...");

    // Ensure config is available
    if (!window.communicationPanelLoaderConfig) {
        console.error("communicationPanelLoaderConfig not found!");
        return Promise.reject("Configuration not loaded");
    }

    const scripts = window.communicationPanelLoaderConfig.aggregatorScripts;

    const promises = scripts.map(scriptPath => {
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
 * Dynamically loads the individual Communication Panel UI loader scripts (for simple components).
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadCommunicationPanelUILoaderScripts() {
    console.log("communicationPanelScriptLoader.js: Loading individual Communication Panel UI loader scripts...");

    if (!window.communicationPanelLoaderConfig) {
        console.error("communicationPanelLoaderConfig not found!");
        return Promise.reject("Configuration not loaded");
    }

    const scripts = window.communicationPanelLoaderConfig.loaderScripts;

    const promises = scripts.map(scriptPath => {
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

// Expose loader functions
window.communicationPanelScriptLoader = {
    loadAggregators: loadCommunicationPanelUILoaderAggregatorScripts,
    loadComponents: loadCommunicationPanelUILoaderScripts
};
