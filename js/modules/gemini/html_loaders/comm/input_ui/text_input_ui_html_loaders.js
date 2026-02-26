/**
 * This file aggregates the loading and initialization logic for Text Input UI HTML components.
 */

// Define the base path for Text Input UI HTML loaders
const TEXT_INPUT_UI_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm/input_ui';

// List of individual UI loader scripts for Text Input UI components
const textInputUILoaderScripts = [
    `${TEXT_INPUT_UI_HTML_LOADERS_BASE_PATH}/input_field/text_input_field_loader.js`,
    `${TEXT_INPUT_UI_HTML_LOADERS_BASE_PATH}/send_btn/sendButtonUILoader.js`,
    `${TEXT_INPUT_UI_HTML_LOADERS_BASE_PATH}/pop_btn/popoutButtonUILoader.js`
    // Add other UI loader scripts for Text Input UI components here in the future
];

/**
 * Dynamically loads the individual Text Input UI loader scripts.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadTextInputUILoaderScripts() {
    console.log("text_input_ui_html_loaders.js: Loading individual Text Input UI loader scripts...");
    const promises = textInputUILoaderScripts.map(scriptPath => {
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
 * Initializes the loading and setup of all Text Input UI HTML components.
 */
async function initializeTextInputUIHtmlComponents() {
    console.log("text_input_ui_html_loaders.js: initializeTextInputUIHtmlComponents started.");

    try {
        // First, dynamically load all the individual UI loader scripts
        await loadTextInputUILoaderScripts();
        console.log("text_input_ui_html_loaders.js: All individual Text Input UI loader scripts loaded.");

        // Now that the scripts are loaded and their functions are available on window,
        // call the load functions for each component.
        if (typeof window.loadTextInputFieldCard === 'function') {
            await window.loadTextInputFieldCard();
            console.log('Text Input Field HTML loaded.');
        } else {
            console.error('loadTextInputFieldCard function not found after dynamic loading.');
        }

        // Load the Send Button
        if (typeof window.loadSendButtonCard === 'function') {
            await window.loadSendButtonCard();
            console.log('Send Button HTML loaded.');
        } else {
            console.error('loadSendButtonCard function not found after dynamic loading.');
        }

        // Load the Popout Button
        if (typeof window.loadPopoutButtonCard === 'function') {
            await window.loadPopoutButtonCard();
            console.log('Popout Button HTML loaded.');
        } else {
            console.error('loadPopoutButtonCard function not found after dynamic loading.');
        }

        // Initialize the text input handlers after the HTML is loaded
        if (window.LogInterfaceDisplay &&
            window.LogInterfaceDisplay.MessagingInterface &&
            window.LogInterfaceDisplay.MessagingInterface.TextInputHandling &&
            typeof window.LogInterfaceDisplay.MessagingInterface.TextInputHandling.initializeTextInputHandlers === 'function') {

            window.LogInterfaceDisplay.MessagingInterface.TextInputHandling.initializeTextInputHandlers();
            console.log('Text input handlers initialized.');
        } else {
            console.error('TextInputHandling namespace or initializeTextInputHandlers function not found after loading handler script.');
        }

    } catch (error) {
        console.error("Error initializing Text Input UI HTML components:", error);
    }

    console.log("text_input_ui_html_loaders.js: initializeTextInputUIHtmlComponents finished.");
}

// Export the initialization function
window.initializeTextInputUIHtmlComponents = initializeTextInputUIHtmlComponents; 