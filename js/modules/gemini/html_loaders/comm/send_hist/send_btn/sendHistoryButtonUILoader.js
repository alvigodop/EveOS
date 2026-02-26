/**
 * Loads the Send Chat History Button HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadSendChatHistoryButton() {
    const placeholder = document.getElementById('send-history-button-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for Send Chat History Button not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<button id="sendHistoryButton" class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored" style="margin-left: 10px;">
    <i class="material-icons" style="vertical-align: middle; margin-right: 4px;">history</i>
    Send Chat History
</button>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder.firstChild); // Upgrade the button itself
        }
        console.log('Send Chat History Button HTML loaded and MDL components upgraded.');

        // Initialize the handler after the HTML is loaded
        if (window.CommunicationPanel &&
            window.CommunicationPanel.SendChatHistoryCommunicationPanel &&
            typeof window.CommunicationPanel.SendChatHistoryCommunicationPanel.initializeChatHistorySender === 'function') {

            window.CommunicationPanel.SendChatHistoryCommunicationPanel.initializeChatHistorySender();
            console.log('Chat History Sender handler initialized from sendHistoryButtonUILoader.js.');
        } else {
            console.error('SendChatHistoryCommunicationPanel namespace or initializeChatHistorySender function not found.');
        }

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Send Chat History Button:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadSendChatHistoryButton = loadSendChatHistoryButton; 