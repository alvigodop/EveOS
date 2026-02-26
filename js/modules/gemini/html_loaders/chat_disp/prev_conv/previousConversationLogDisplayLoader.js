/**
 * Loads the Previous Conversation Log card HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadPreviousConversationLogCard() {
    const placeholder = document.getElementById('previous-conversation-log-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for Previous Conversation Log card not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<!-- Previous Conversation Log Card Component -->
<div id="previousConversationLog" class="mdl-shadow--2dp" style="display: none; margin-bottom: 16px; border: 1px solid #673ab7; border-radius: 8px; padding: 0;">
    <div class="previous-chat-controls" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background-color: #f3e5f5; border-bottom: 1px solid #673ab7; position: sticky; top: 0; z-index: 1;">
        <span style="font-weight: bold; color: #673ab7;">Previous Conversations</span>
        <div style="display: flex; gap: 8px;">
            <button id="clearPreviousConversationButton" class="mdl-button mdl-js-button mdl-button--icon" title="Clear Previous Conversation" style="color: #f44336;">
                <i class="material-icons">delete</i>
            </button>
            <button id="hidePreviousConversationButton" class="mdl-button mdl-js-button mdl-button--icon" title="Hide Previous Conversation" onclick="toggleConversationHistory()">
            <i class="material-icons">close</i>
        </button>
    </div>
    </div>
    <div id="previousConversationContent" style="padding: 0 16px 16px 16px;"></div>
</div>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('Previous Conversation Log card loaded and MDL components upgraded.');

        // Initialize the previous conversation clear handler after the HTML is loaded
        if (window.CommunicationPanel &&
            window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel &&
            window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI &&
            typeof window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.initializePreviousConversationClearHandler === 'function') {

            window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.initializePreviousConversationClearHandler();
            console.log('Previous conversation clear handler initialized from loader.');
        } else {
            console.error('ConversationHistoryUI namespace or initializePreviousConversationClearHandler function not found.');
        }

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Previous Conversation Log card:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadPreviousConversationLogCard = loadPreviousConversationLogCard; 