/**
 * chatClearLogic.js
 * Handles the logic for clearing current, past, and all chats.
 */

window.ChatClearing = window.ChatClearing || {};

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

    clearPastChats: function () {
        if (confirm("Are you sure you want to clear all past chats?")) {
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

    clearAllChats: function () {
        if (confirm("Are you sure you want to clear all chats? This cannot be undone.")) {
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
