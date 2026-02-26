/**
 * This file aggregates the loading and initialization logic for Send Chat History UI HTML components.
 */

// Define the base path for Send Chat History UI HTML loaders
const SEND_CHAT_HISTORY_UI_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm/send_hist';

// List of individual UI loader scripts for Send Chat History UI components
const sendChatHistoryUILoaderScripts = [
    `${SEND_CHAT_HISTORY_UI_HTML_LOADERS_BASE_PATH}/send_btn/sendHistoryButtonUILoader.js`
    // Add other UI loader scripts for Send Chat History UI components here in the future
];

// List of required JavaScript files that provide the functionality
const sendChatHistoryFunctionalityScripts = [
    (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/send_hist/chat_history_sending_operations/chatHistorySender.js'
];

/**
 * Dynamically loads the individual Send Chat History UI loader scripts.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadSendChatHistoryUILoaderScripts() {
    console.log("send_chat_history_html_loader.js: Loading individual Send Chat History UI loader scripts...");
    return Promise.all(sendChatHistoryUILoaderScripts.map(scriptPath => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptPath;
            script.onload = () => {
                console.log(`${scriptPath} loaded.`);
                resolve();
            };
            script.onerror = () => reject(new Error(`Failed to load ${scriptPath}`));
            document.head.appendChild(script);
        });
    }));
}

/**
 * Dynamically loads the required functionality scripts.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadSendChatHistoryFunctionalityScripts() {
    console.log("send_chat_history_html_loader.js: Loading Send Chat History functionality scripts...");
    return Promise.all(sendChatHistoryFunctionalityScripts.map(scriptPath => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptPath;
            script.onload = () => {
                console.log(`${scriptPath} loaded.`);
                resolve();
            };
            script.onerror = () => reject(new Error(`Failed to load ${scriptPath}`));
            document.head.appendChild(script);
        });
    }));
}

/**
 * Initializes all Send Chat History UI HTML Components after loading the HTML and the required scripts.
 * This function loads the individual HTML components and sets up their JavaScript handlers.
 * Returns a Promise that resolves when all components are initialized.
 */
async function initializeSendChatHistoryUIHtmlComponents() {
    console.log("send_chat_history_html_loader.js: initializeSendChatHistoryUIHtmlComponents started.");

    try {
        // First load the functionality scripts
        await loadSendChatHistoryFunctionalityScripts();
        console.log("send_chat_history_html_loader.js: All Send Chat History functionality scripts loaded.");

        // Then load the UI loader scripts
        await loadSendChatHistoryUILoaderScripts();
        console.log("send_chat_history_html_loader.js: All individual Send Chat History UI loader scripts loaded.");

        // Initialize the UI components after loading the functionality scripts
        if (typeof window.loadSendChatHistoryButton === 'function') {
            await window.loadSendChatHistoryButton();
            console.log("Send Chat History Button HTML loaded and handler initialized via send_chat_history_html_loader.js.");
        } else {
            console.warn("loadSendChatHistoryButton function not found.");
        }

        console.log("send_chat_history_html_loader.js: initializeSendChatHistoryUIHtmlComponents finished.");
    } catch (error) {
        console.error("send_chat_history_html_loader.js: Error in initializeSendChatHistoryUIHtmlComponents:", error);
        throw error;
    }
}

// Export the initialization function
window.initializeSendChatHistoryUIHtmlComponents = initializeSendChatHistoryUIHtmlComponents; 