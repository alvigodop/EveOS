/**
 * This file aggregates the loading and initialization logic for Chat Log Display HTML components.
 */

// Define the base path for Chat Log Display HTML loaders
const CHAT_LOG_DISPLAY_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/chat_disp';

// List of scripts to be loaded for Chat Log Display components (includes both UI loaders and handlers)
const chatLogDisplayScripts = [
    `${CHAT_LOG_DISPLAY_HTML_LOADERS_BASE_PATH}/main_chat/mainChatLogUILoader.js?v=5e482b6a052f`,
    `${CHAT_LOG_DISPLAY_HTML_LOADERS_BASE_PATH}/logCopyRuntime.js?v=4ef10c50d114`,
    `${CHAT_LOG_DISPLAY_HTML_LOADERS_BASE_PATH}/prev_conv/previousConversationLogDisplayLoader.js?v=224c49910a10`,
    `${CHAT_LOG_DISPLAY_HTML_LOADERS_BASE_PATH}/toggle_hist/toggleConversationHistoryButtonUILoader.js?v=8d3d716beedc`,
    `${CHAT_LOG_DISPLAY_HTML_LOADERS_BASE_PATH}/sys_log/systemLogDisplayUILoader.js?v=278b34ce00e1`,
    (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/logs/sys_log/server_reboot_button/serverRebootButtonHandler.js?v=9e7bfdb6ff94',
    (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/hist_toggle/conversation_history_ui/previousConversationClearHandler.js?v=316ce84da1c4',
    (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/hist_toggle/conversation_history_ui/conversationHistoryToggler.js?v=0a5b38918cbb' // Add the handler script
    // Add other scripts for Chat Log Display components here in the future
];

/**
 * Dynamically loads the scripts for Chat Log Display components.
 * Returns a Promise that resolves when all scripts are loaded.
 */
function loadChatLogDisplayScripts() {
    console.log("chat_log_display_components_html_loaders.js: Loading Chat Log Display scripts...");
    const promises = chatLogDisplayScripts.map(scriptPath => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptPath;
            // `defer` is ignored on dynamically inserted scripts; async=false is what actually
            // guarantees list-order execution instead of download-completion order.
            script.async = false;
            script.defer = true;
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
 * Initializes the loading and setup of all Chat Log Display UI HTML components and their handlers.
 */
async function initializeChatLogDisplayHtmlComponents() {
    console.log("chat_log_display_components_html_loaders.js: initializeChatLogDisplayHtmlComponents started.");

    try {
        // First, dynamically load all the necessary scripts (UI loaders and handlers)
        await loadChatLogDisplayScripts();
        console.log("chat_log_display_components_html_loaders.js: All Chat Log Display scripts loaded.");

        // Load the Main Chat Log first (since other components may reference it)
        if (typeof window.loadMainChatLog === 'function') {
            await window.loadMainChatLog();
            console.log('Main Chat Log HTML loaded.');
        } else {
            console.error('loadMainChatLog function not found after dynamic loading.');
        }

        // Now that the scripts are loaded and their functions/namespaces are available on window,
        // call the load functions for the UI components.
        if (typeof window.loadPreviousConversationLogCard === 'function') {
            await window.loadPreviousConversationLogCard();
            console.log('Previous Conversation Log HTML loaded and handler initialized.'); // Updated log message
            // The initialization of the handler is now called within loadPreviousConversationLogCard
        } else {
            console.error('loadPreviousConversationLogCard function not found after dynamic loading.');
        }

        // Load the Toggle Conversation History Button
        if (typeof window.loadToggleConversationHistoryButton === 'function') {
            await window.loadToggleConversationHistoryButton();
            console.log('Toggle Conversation History Button HTML loaded.');
        } else {
            console.error('loadToggleConversationHistoryButton function not found after dynamic loading.');
        }

        // Load the System Log Display
        if (typeof window.loadSystemLogDisplay === 'function') {
            await window.loadSystemLogDisplay();
            console.log('System Log Display HTML loaded.');
        } else {
            console.error('loadSystemLogDisplay function not found after dynamic loading.');
        }

        // Now that both the log card and the button are loaded, initialize the toggler
        if (window.CommunicationPanel &&
            window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel &&
            window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI &&
            typeof window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.initializeConversationHistoryToggler === 'function') {

            window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.initializeConversationHistoryToggler();
            console.log('Conversation history toggler initialized from aggregator after button and log display are loaded.');
        } else {
            console.error('ConversationHistoryUI namespace or initializeConversationHistoryToggler function not found when trying to initialize from aggregator.');
        }

    } catch (error) {
        console.error("Error initializing Chat Log Display HTML components and handlers:", error);
    }

    console.log("chat_log_display_components_html_loaders.js: initializeChatLogDisplayHtmlComponents finished.");
}

// Export the initialization function to be called by html_initialization_loaders.js
window.initializeChatLogDisplayHtmlComponents = initializeChatLogDisplayHtmlComponents;
