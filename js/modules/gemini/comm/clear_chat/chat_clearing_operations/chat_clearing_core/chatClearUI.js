/**
 * chatClearUI.js
 * Handles the UI creation and management for the Chat Clear Dialog.
 */

window.ChatClearing = window.ChatClearing || {};

window.ChatClearing.UI = {
    openDialog: function () {
        // Prevent multiple dialogs
        if (document.getElementById('chat-clear-dialog')) {
            return;
        }

        const clearDialog = document.createElement('div');
        clearDialog.id = 'chat-clear-dialog';
        clearDialog.style.position = 'fixed';
        clearDialog.style.top = '50%';
        clearDialog.style.left = '50%';
        clearDialog.style.transform = 'translate(-50%, -50%)';
        clearDialog.style.backgroundColor = 'white';
        clearDialog.style.padding = '20px';
        clearDialog.style.borderRadius = '8px';
        clearDialog.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        clearDialog.style.zIndex = '1000';
        clearDialog.style.minWidth = '300px';

        clearDialog.innerHTML = `
            <h4 style="margin-top: 0; color: #333;">Clear Chat Options</h4>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored" onclick="window.ChatClearing.Logic.clearCurrentChat()">
                    Clear Current Chat
                </button>
                <button class="mdl-button mdl-js-button mdl-button--raised mdl-button--accent" style="background-color: #ff5722;" onclick="window.ChatClearing.Logic.clearPastChats()">
                    Clear All Past Chats
                </button>
                <button class="mdl-button mdl-js-button mdl-button--raised mdl-button--accent" style="background-color: #d32f2f;" onclick="window.ChatClearing.Logic.clearAllChats()">
                    Clear Everything
                </button>
                <button class="mdl-button mdl-js-button mdl-button--raised" onclick="window.ChatClearing.UI.closeDialog()">
                    Cancel
                </button>
            </div>
        `;

        // Add overlay
        const overlay = document.createElement('div');
        overlay.id = 'chat-clear-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '999';

        document.body.appendChild(overlay);
        document.body.appendChild(clearDialog);
    },

    closeDialog: function () {
        const clearDialog = document.getElementById('chat-clear-dialog');
        const overlay = document.getElementById('chat-clear-overlay');

        if (clearDialog) document.body.removeChild(clearDialog);
        if (overlay) document.body.removeChild(overlay);
    }
};

console.log("chatClearUI.js loaded.");
