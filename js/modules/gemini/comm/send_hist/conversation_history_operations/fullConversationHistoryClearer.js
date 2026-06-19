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

async function clearConversationHistory() {
    const confirmed = await geminiConfirmAction(
        'Clear Conversation History',
        'Are you sure you want to clear the conversation history?',
        { confirmLabel: 'Clear History', kind: 'gemini-clear-conversation-history' }
    );
    if (!confirmed) return;

    historyLoaded = false;
    historyMessages = new Set();
    historyMessageOrder = [];

    const previousConversationContent = document.getElementById('previousConversationContent');
    if (previousConversationContent) {
        previousConversationContent.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #666;">
                <p>History has been cleared</p>
            </div>`;
    }

    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({ command: 'clear_history' }));
    }

    displayMessage('System Message: Conversation history cleared');
}