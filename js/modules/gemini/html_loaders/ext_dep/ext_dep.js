/**
 * This file aggregates the loading and initialization logic for External Dependencies HTML components.
 */

// Define the base path for External Dependencies HTML loaders
const EXTERNAL_DEPENDENCIES_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/ext_dep';

// List of individual UI loader scripts for External Dependencies components
const externalDependenciesLoaderScripts = [
    `${EXTERNAL_DEPENDENCIES_HTML_LOADERS_BASE_PATH}/ext_scripts/externalStylesheetsAndScriptsUILoader.js`,
    `${EXTERNAL_DEPENDENCIES_HTML_LOADERS_BASE_PATH}/loc_style/localStylesheetUILoader.js`
    // Add other external dependency loader scripts here in the future
];

/**
 * Dynamically loads the Local Stylesheet UI loader script.
 */
function loadLocalStylesheetLoaderScript() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${EXTERNAL_DEPENDENCIES_HTML_LOADERS_BASE_PATH}/loc_style/localStylesheetUILoader.js`;
        script.defer = true;
        script.onload = () => {
            console.log("localStylesheetUILoader.js loaded.");
            resolve();
        };
        script.onerror = (error) => {
            console.error("Failed to load localStylesheetUILoader.js:", error);
            reject(error);
        };
        document.body.appendChild(script);
    });
}

/**
 * Dynamically loads the External Stylesheets and Scripts UI loader script.
 */
function loadExternalScriptsLoaderScript() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${EXTERNAL_DEPENDENCIES_HTML_LOADERS_BASE_PATH}/ext_scripts/externalStylesheetsAndScriptsUILoader.js`;
        script.defer = true;
        script.onload = () => {
            console.log("externalStylesheetsAndScriptsUILoader.js loaded.");
            resolve();
        };
        script.onerror = (error) => {
            console.error("Failed to load externalStylesheetsAndScriptsUILoader.js:", error);
            reject(error);
        };
        document.body.appendChild(script);
    });
}

/**
 * Initializes ONLY the Local Stylesheet (CSS).
 * Should be called as early as possible.
 */
async function initializeLocalStylesheet() {
    console.log("external_dependencies_html_loaders.js: initializeLocalStylesheet started.");
    try {
        await loadLocalStylesheetLoaderScript();
        if (typeof window.loadLocalStylesheet === 'function') {
            await window.loadLocalStylesheet();
            console.log('external_dependencies_html_loaders.js: Local Stylesheet loaded.');
        } else {
            console.error('loadLocalStylesheet function not found.');
        }
    } catch (error) {
        console.error("Error initializing Local Stylesheet:", error);
    }
}

/**
 * Initializes ONLY the External Scripts (Material Design Lite, etc).
 * Should be called LAST to allow HTML to render first.
 */
async function initializeExternalScripts() {
    console.log("external_dependencies_html_loaders.js: initializeExternalScripts started.");
    try {
        await loadExternalScriptsLoaderScript();
        if (typeof window.loadExternalStylesheetsAndScripts === 'function') {
            await window.loadExternalStylesheetsAndScripts();
            console.log('external_dependencies_html_loaders.js: External Stylesheets and Scripts loaded.');
        } else {
            console.error('loadExternalStylesheetsAndScripts function not found.');
        }
    } catch (error) {
        console.error("Error initializing External Scripts:", error);
    }
}

/**
 * Legacy initialization function (loads both).
 */
async function initializeExternalDependenciesHtmlComponents() {
    console.log("external_dependencies_html_loaders.js: initializeExternalDependenciesHtmlComponents started (LEGACY Mode).");
    await initializeLocalStylesheet();
    await initializeExternalScripts();
}

// Export functions for use by the main HTML initialization loader
window.initializeLocalStylesheet = initializeLocalStylesheet;
window.initializeExternalScripts = initializeExternalScripts;
window.initializeExternalDependenciesHtmlComponents = initializeExternalDependenciesHtmlComponents; 