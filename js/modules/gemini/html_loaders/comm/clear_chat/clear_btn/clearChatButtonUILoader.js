/**
 * Loads the Clear Chat Button HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadClearChatButton() {
    const placeholder = document.getElementById('clear-chat-button-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for Clear Chat Button not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<!-- Clear Chat Button Component -->
<button id="clearChatButton" class="mdl-button mdl-js-button mdl-button--raised mdl-button--accent gemini-command-action-btn gemini-command-action-btn--danger">
    <i class="material-icons gemini-command-action-icon">clear_all</i>
    <span class="gemini-command-action-label">Clear Chat</span>
</button>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('Clear Chat Button HTML loaded and MDL components upgraded.');

        // Initialize the handler after the HTML is loaded
        if (window.CommunicationPanel &&
            window.CommunicationPanel.ClearChatCommunicationPanel &&
            typeof window.CommunicationPanel.ClearChatCommunicationPanel.initializeClearChatHandler === 'function') {

            window.CommunicationPanel.ClearChatCommunicationPanel.initializeClearChatHandler();
            console.log('Clear Chat handler initialized from loader.');
        } else {
            console.debug('Clear Chat handler deferred until Communication Panel handlers are ready.');
        }

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Clear Chat Button:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadClearChatButton = loadClearChatButton; 
