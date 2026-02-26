/**
 * Loads the New Chat Button HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadNewChatButtonCard() {
    const placeholder = document.getElementById('new-chat-button-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for New Chat Button card not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<button id="newChatButton"
    class="mdl-button mdl-js-button mdl-button--fab mdl-button--mini-fab"
    style="background-color: #00bcd4;"
    title="Start New Chat">
    <i class="material-icons">add_comment</i>
</button>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('New Chat Button card loaded and MDL components upgraded.');

        // Initialize the handler after the HTML is loaded
        // Assuming the handler is in CommunicationPanel.StartNewChatCommunicationPanel.initializeNewChatHandler
        if (window.CommunicationPanel &&
            window.CommunicationPanel.StartNewChatCommunicationPanel &&
            typeof window.CommunicationPanel.StartNewChatCommunicationPanel.initializeNewChatHandler === 'function') {

            window.CommunicationPanel.StartNewChatCommunicationPanel.initializeNewChatHandler();
            console.log('New Chat handler initialized from loader.');
        } else {
            console.error('StartNewChatCommunicationPanel namespace or initializeNewChatHandler function not found.');
        }

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load New Chat Button card:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadNewChatButtonCard = loadNewChatButtonCard; 