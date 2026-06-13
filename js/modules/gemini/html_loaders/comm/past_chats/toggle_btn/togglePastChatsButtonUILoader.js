/**
 * Loads the Toggle Past Chats Button HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadTogglePastChatsButton() {
    const placeholder = document.getElementById('toggle-past-chats-button-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for Toggle Past Chats Button not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<button id="togglePastChatsButton"
    class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored gemini-command-action-btn gemini-command-action-btn--secondary"
    title="Toggle Past Chats Display">
    <i class="material-icons gemini-command-action-icon">history_toggle_off</i>
    <span class="gemini-command-action-label">Toggle Past Chats</span>
</button>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder.firstChild); // Upgrade the button itself
        }
        console.log('Toggle Past Chats Button HTML loaded and MDL components upgraded.');

        // Initialize the handler after the HTML is loaded
        // Assuming the handler is in CommunicationPanel.TogglePastChatsCommunicationPanel.PastChatsUI.initializePastChatsVisibilityToggler
        if (window.CommunicationPanel &&
            window.CommunicationPanel.TogglePastChatsCommunicationPanel &&
            window.CommunicationPanel.TogglePastChatsCommunicationPanel.PastChatsUI &&
            typeof window.CommunicationPanel.TogglePastChatsCommunicationPanel.PastChatsUI.initializePastChatsVisibilityToggler === 'function') {

            window.CommunicationPanel.TogglePastChatsCommunicationPanel.PastChatsUI.initializePastChatsVisibilityToggler();
            console.log('Past Chats Visibility Toggler handler initialized from loader.');
        } else {
            console.debug('Past Chats handler deferred until Communication Panel handlers are ready.');
        }

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Toggle Past Chats Button:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadTogglePastChatsButton = loadTogglePastChatsButton; 
