/**
 * chatClearLogic.js
 * Handles the logic for clearing current, past, and all chats.
 */

window.ChatClearing = window.ChatClearing || {};

function geminiChatClearConfirm(title, message, options = {}) {
    if (typeof window.showConfirmWithTitle === 'function') {
        return window.showConfirmWithTitle(title, message, Object.assign({
            confirmLabel: options.confirmLabel || 'Confirm',
            cancelLabel: options.cancelLabel || 'Cancel',
            kind: options.kind || 'gemini-chat-clear-confirm'
        }, options));
    }
    if (typeof window.showConfirm === 'function') {
        return window.showConfirm(message, Object.assign({
            title,
            confirmLabel: options.confirmLabel || 'Confirm',
            cancelLabel: options.cancelLabel || 'Cancel',
            kind: options.kind || 'gemini-chat-clear-confirm'
        }, options));
    }
    if (window.MessagingLog && window.MessagingLog.displayMessage) {
        window.MessagingLog.displayMessage('System Message: Confirmation UI is still loading. Try again in a moment.');
    }
    return Promise.resolve(false);
}

window.ChatClearing.Logic = {
    clearCurrentChat: function () {
        const chatLog = document.getElementById('chatLog');
        if (!chatLog) {
            console.warn("chatLog element not found.");
            return;
        }

        // Save current chat to past chats if not empty
        const container = chatLog.querySelector('.chat-messages-container') || chatLog;
        const currentChat = container.innerHTML;
        if (currentChat.trim()) {
            const timestamp = new Date().toLocaleString();
            const voiceSelect = document.getElementById('voiceSelect');
            const voice = voiceSelect ? voiceSelect.value : 'Unknown';

            // Assume 'pastChats' and 'updatePastChatsDisplay' are available via their respective modules or globals
            // We should check if they exist, but for now we follow the existing pattern
            if (typeof pastChats !== 'undefined') {
                pastChats.push({
                    timestamp: timestamp,
                    voice: voice,
                    content: currentChat
                });
            }

            if (window.PastChatsUI && window.PastChatsUI.Renderer) {
                window.PastChatsUI.Renderer.updateDisplay(pastChats);
            } else if (typeof updatePastChatsDisplay === 'function') {
                updatePastChatsDisplay();
            }

            if (window.MessagingLog && window.MessagingLog.displayMessage) {
                window.MessagingLog.displayMessage("System Message: Current chat saved to past chats");
            }
        }

        if (container) {
            container.innerHTML = '';
        } else {
            chatLog.innerHTML = '';
        }
        if (window.MessagingLog && window.MessagingLog.displayMessage) {
            window.MessagingLog.displayMessage("System Message: Current chat cleared");
        }

        // Clear localStorage
        localStorage.removeItem('geminiChatHistory');

        // Send command to clear server-side history
        this.sendClearCommand();

        if (window.ChatClearing.UI) {
            window.ChatClearing.UI.closeDialog();
        }
    },

    clearPastChats: async function () {
        const confirmed = await geminiChatClearConfirm(
            'Clear Past Chats',
            'Clear all saved past chats? This cannot be undone.',
            { confirmLabel: 'Clear Past Chats', kind: 'gemini-clear-past-chats' }
        );
        if (confirmed) {
            if (typeof pastChats !== 'undefined') {
                pastChats.length = 0; // Clear array
            }

            if (window.PastChatsUI && window.PastChatsUI.Renderer) {
                window.PastChatsUI.Renderer.updateDisplay(pastChats);
            } else if (typeof updatePastChatsDisplay === 'function') {
                updatePastChatsDisplay();
            }

            if (window.MessagingLog && window.MessagingLog.displayMessage) {
                window.MessagingLog.displayMessage("System Message: All past chats cleared");
            }

            // Send command to clear server-side history
            this.sendClearCommand();

            if (window.ChatClearing.UI) {
                window.ChatClearing.UI.closeDialog();
            }
        }
    },

    clearAllChats: async function () {
        const confirmed = await geminiChatClearConfirm(
            'Clear All Chats',
            'Clear the current chat and all saved past chats? This cannot be undone.',
            { confirmLabel: 'Clear All', kind: 'gemini-clear-all-chats' }
        );
        if (confirmed) {
            const chatLog = document.getElementById('chatLog');
            if (chatLog) {
                const container = chatLog.querySelector('.chat-messages-container');
                if (container) {
                    container.innerHTML = '';
                } else {
                    chatLog.innerHTML = '';
                }
            }

            if (typeof pastChats !== 'undefined') {
                pastChats.length = 0;
            }

            if (window.PastChatsUI && window.PastChatsUI.Renderer) {
                window.PastChatsUI.Renderer.updateDisplay(pastChats);
            } else if (typeof updatePastChatsDisplay === 'function') {
                updatePastChatsDisplay();
            }

            if (window.MessagingLog && window.MessagingLog.displayMessage) {
                window.MessagingLog.displayMessage("System Message: All chats cleared");
            }

            // Clear localStorage
            localStorage.removeItem('geminiChatHistory');

            // Send command to clear server-side history
            this.sendClearCommand();

            if (window.ChatClearing.UI) {
                window.ChatClearing.UI.closeDialog();
            }
        }
    },

    sendClearCommand: function () {
        if (typeof webSocket !== 'undefined' && webSocket && webSocket.readyState === WebSocket.OPEN) {
            webSocket.send(JSON.stringify({ command: "clear_history" }));
        }
    }
};

console.log("chatClearLogic.js loaded.");
