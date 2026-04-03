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
<div id="previousConversationLog" class="mdl-shadow--2dp gemini-history-log" style="display: none;">
    <div class="previous-chat-controls gemini-history-header">
        <div class="gemini-history-header-copy">
            <div class="gemini-history-kicker">Conversation Cache</div>
            <span class="gemini-history-title">Previous Conversations</span>
        </div>
        <div class="gemini-history-actions">
            <button id="clearPreviousConversationButton" class="mdl-button mdl-js-button mdl-button--icon gemini-history-btn gemini-history-btn--danger" title="Clear Previous Conversation">
                <i class="material-icons">delete</i>
            </button>
            <button id="hidePreviousConversationButton" class="mdl-button mdl-js-button mdl-button--icon gemini-history-btn" title="Hide Previous Conversation" onclick="toggleConversationHistory()">
                <i class="material-icons">close</i>
            </button>
        </div>
    </div>
    <div id="previousConversationContent" class="gemini-history-content"></div>
</div>
`;
        placeholder.innerHTML = htmlContent;
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('Previous Conversation Log card loaded and MDL components upgraded.');

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

window.loadPreviousConversationLogCard = loadPreviousConversationLogCard;
