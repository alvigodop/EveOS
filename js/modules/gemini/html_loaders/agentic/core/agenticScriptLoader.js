/**
 * agenticScriptLoader.js
 * Handles the dynamic loading of agentic UI loader scripts.
 */

/**
 * Dynamically loads the individual agentic UI loader scripts defined in the config.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadAgenticUILoaderScripts() {
    console.log("agenticScriptLoader.js: Loading individual agentic UI loader scripts...");

    // Ensure config is loaded
    if (typeof window.AgenticLoaderConfig === 'undefined' || !window.AgenticLoaderConfig.SCRIPTS) {
        console.error("AgenticLoaderConfig not found or invalid!");
        return Promise.reject(new Error("AgenticLoaderConfig missing"));
    }

    const promises = window.AgenticLoaderConfig.SCRIPTS.map(scriptPath => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptPath;
            // Dynamically inserted scripts IGNORE `defer` and execute in download-completion
            // order by default — with the UIState/UICard/UILoader (and scope runtime) splits
            // this made the facade race its helpers, so the relay card loaded in some
            // browsers and not others. async=false restores list-order execution.
            script.async = false;
            script.defer = true;
            script.onload = () => {
                // console.log(`${scriptPath} loaded.`); // Optional: Reduce noise
                resolve();
            };
            script.onerror = (error) => {
                console.error(`Failed to load ${scriptPath}:`, error);
                reject(error);
            };
            document.head.appendChild(script); // Append to head is generally safer for defer execution order logic
        });
    });
    return Promise.all(promises);
}

// Export the loader function
window.loadAgenticUILoaderScripts = loadAgenticUILoaderScripts;

console.log("agenticScriptLoader.js loaded.");
