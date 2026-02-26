/**
 * This file aggregates the loading and initialization logic for general UI HTML components.
 * It is loaded by pageInitializer.js.
 */

// Define the base path for these UI component HTML loaders
const UI_COMPONENT_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm/mm_comm_load/scr_share';

// List of individual UI component loader scripts
const uiComponentLoaderScripts = [
    `${UI_COMPONENT_HTML_LOADERS_BASE_PATH}/btn/screenShareButtonLoader.js`,
    `${UI_COMPONENT_HTML_LOADERS_BASE_PATH}/vid_canv/video_canvas_elements_loader.js`,
    // Add other general UI component loaders here in the future
];

/**
 * Dynamically loads the individual UI component loader scripts.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadUiComponentLoaderScripts() {
    console.log("ui_component_html_loaders.js: Loading individual UI component loader scripts...");
    const promises = uiComponentLoaderScripts.map(scriptPath => {
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
 * Initializes the loading and setup of all general UI HTML components.
 */
async function initializeUiComponentHtmlComponents() {
    console.log("ui_component_html_loaders.js: initializeUiComponentHtmlComponents started.");
    let screenShareButtonElement = null;

    try {
        // First, dynamically load all the individual UI loader scripts
        await loadUiComponentLoaderScripts();
        console.log("ui_component_html_loaders.js: All individual UI component loader scripts loaded.");

        // Now that the scripts are loaded and their functions are available on window,
        // call the load functions for each component.

        // Load the Screen Share Button first
        if (window.loadScreenShareButton && typeof window.loadScreenShareButton === 'function') {
            screenShareButtonElement = await window.loadScreenShareButton();
            if (screenShareButtonElement) {
                console.log('Screen Share Button loaded and element stored.');
            } else {
                console.error('Screen Share Button loaded but element was not returned.');
            }
        } else {
            console.error('loadScreenShareButton function not found after dynamic loading.');
        }

        // Load the Video and Canvas elements, passing the screenShareButtonElement
        if (window.MediaDisplayElementsHTMLLoader && typeof window.MediaDisplayElementsHTMLLoader.loadVideoCanvasElements === 'function') {
            await window.MediaDisplayElementsHTMLLoader.loadVideoCanvasElements(screenShareButtonElement);
            console.log('Video and Canvas elements loaded and initialized.');
        } else {
            console.error('loadVideoCanvasElements function not found after dynamic loading.');
        }

        // Add calls to other UI component loaders here in the future

    } catch (error) {
        console.error("Error initializing UI HTML components:", error);
    }

    console.log("ui_component_html_loaders.js: initializeUiComponentHtmlComponents finished.");
}

// Export the initialization function to be called by pageInitializer.js
window.initializeUiComponentHtmlComponents = initializeUiComponentHtmlComponents; 