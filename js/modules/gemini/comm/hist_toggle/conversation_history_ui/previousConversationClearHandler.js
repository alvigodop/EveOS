window.CommunicationPanel = window.CommunicationPanel || {};
window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel = window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel || {};
window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI = window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI || {};

function geminiConfirmAction(title, message, options = {}) {
    if (typeof window.showConfirmWithTitle === 'function') {
        return window.showConfirmWithTitle(title, message, Object.assign({
            confirmLabel: options.confirmLabel || 'Confirm',
            cancelLabel: 'Cancel',
            kind: options.kind || 'gemini-history-confirm'
        }, options));
    }
    if (typeof window.showConfirm === 'function') {
        return window.showConfirm(message, Object.assign({
            title,
            confirmLabel: options.confirmLabel || 'Confirm',
            cancelLabel: 'Cancel',
            kind: options.kind || 'gemini-history-confirm'
        }, options));
    }
    if (typeof window.displayMessage === 'function') {
        window.displayMessage('System Message: Confirmation UI is still loading. Try again in a moment.', true);
    }
    return Promise.resolve(false);
}

function initializePreviousConversationClearHandler() {
    console.log('Initializing previous conversation clear handler.');
    const clearButton = document.getElementById('clearPreviousConversationButton');

    if (!clearButton) {
        console.error("Element with ID 'clearPreviousConversationButton' not found for previousConversationClearHandler. Handler will not be fully initialized.");
        return;
    }
    if (clearButton.dataset.previousConversationClearBound === '1') return;
    clearButton.dataset.previousConversationClearBound = '1';

    clearButton.addEventListener('click', async () => {
        const confirmed = await geminiConfirmAction(
            'Clear Previous Conversation',
            'Are you sure you want to clear the previous conversation history? This cannot be undone.',
            { confirmLabel: 'Clear History', kind: 'gemini-clear-previous-conversation' }
        );
        if (!confirmed) return;

        const previousConversationContent = document.getElementById('previousConversationContent');
        if (previousConversationContent) previousConversationContent.innerHTML = '';

        if (typeof window.webSocket !== 'undefined' && window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
            window.webSocket.send(JSON.stringify({ command: 'clear_history' }));
            if (typeof displayMessage === 'function') displayMessage('System Message: Chat history cleared from server', true);
        } else if (typeof displayMessage === 'function') {
            displayMessage('System Message: Could not clear server history - connection not available', true);
        }
    });
    console.log('Previous conversation clear handler initialization complete.');
}

window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.initializePreviousConversationClearHandler = initializePreviousConversationClearHandler;