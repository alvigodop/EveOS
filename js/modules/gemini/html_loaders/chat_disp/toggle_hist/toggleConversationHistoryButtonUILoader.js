/**
 * Loads the Toggle Conversation History Button HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadToggleConversationHistoryButton() {
    const placeholder = document.getElementById('toggle-conversation-history-button-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for Toggle Conversation History Button not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<button id="toggleHistoryButton"
    class="mdl-button mdl-js-button mdl-button--fab mdl-button--mini-fab"
    style="background-color: #673ab7;"
    title="Toggle Conversation History">
    <i class="material-icons">history</i>
</button>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder.firstChild); // Upgrade the button itself
        }
        console.log('Toggle Conversation History Button HTML loaded and MDL components upgraded.');

        // Initialize the handler after the HTML is loaded
        // The handler is initialized by previousConversationLogDisplayLoader.js
        // if it's part of the same logical group, or directly if standalone.
        // For now, assuming conversationHistoryToggler.js's init function is called correctly
        // by the existing logic in previousConversationLogDisplayLoader.js or pageInitializer.js
        // No explicit call here needed unless it's confirmed to be missing.
        // If initializeConversationHistoryToggler is specifically for THIS button and needs to be called here:
        if (window.CommunicationPanel &&
            window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel &&
            window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI &&
            typeof window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.initializeConversationHistoryToggler === 'function') {

            // Call it if it's not being called already or needs to be called after this specific button is loaded.
            // window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.initializeConversationHistoryToggler();
            // console.log('Conversation History Toggler (re)initialized if necessary from button loader.');
        }


        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Toggle Conversation History Button:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadToggleConversationHistoryButton = loadToggleConversationHistoryButton; 