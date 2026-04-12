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
        clearDialog.style.background = 'linear-gradient(145deg, rgba(12, 17, 24, 0.98), rgba(8, 12, 18, 0.96))';
        clearDialog.style.border = '1px solid rgba(0, 212, 255, 0.2)';
        clearDialog.style.padding = '24px';
        clearDialog.style.borderRadius = '16px';
        clearDialog.style.boxShadow = '0 24px 80px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
        clearDialog.style.zIndex = '100000'; // High enough to overlay Search Monitor
        clearDialog.style.minWidth = '320px';
        clearDialog.style.color = '#e8f7ff';
        clearDialog.style.backdropFilter = 'blur(10px)';

        clearDialog.innerHTML = `
            <h4 style="margin-top: 0; margin-bottom: 20px; color: #f4fbff; font-weight: 600; font-size: 1.25rem;">Clear Chat Options</h4>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button class="mdl-button mdl-js-button" style="background: rgba(0, 212, 255, 0.1); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.3); border-radius: 8px; padding: 10px; height: auto;" onclick="window.ChatClearing.Logic.clearCurrentChat()">
                    Clear Current Chat
                </button>
                <button class="mdl-button mdl-js-button" style="background: rgba(255, 87, 34, 0.1); color: #ff8a65; border: 1px solid rgba(255, 87, 34, 0.3); border-radius: 8px; padding: 10px; height: auto;" onclick="window.ChatClearing.Logic.clearPastChats()">
                    Clear All Past Chats
                </button>
                <button class="mdl-button mdl-js-button" style="background: rgba(211, 47, 47, 0.15); color: #ff8a80; border: 1px solid rgba(211, 47, 47, 0.4); border-radius: 8px; padding: 10px; height: auto;" onclick="window.ChatClearing.Logic.clearAllChats()">
                    Clear Everything
                </button>
                <button class="mdl-button mdl-js-button" style="background: rgba(255, 255, 255, 0.05); color: #b0bec5; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 10px; height: auto; margin-top: 8px;" onclick="window.ChatClearing.UI.closeDialog()">
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
        overlay.style.backgroundColor = 'rgba(0,0,0,0.65)';
        overlay.style.backdropFilter = 'blur(6px)';
        overlay.style.zIndex = '99999';

        document.body.appendChild(overlay);
        document.body.appendChild(clearDialog);
        
        // Upgrade MDL components
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(clearDialog);
        }
    },

    closeDialog: function () {
        const clearDialog = document.getElementById('chat-clear-dialog');
        const overlay = document.getElementById('chat-clear-overlay');

        if (clearDialog) document.body.removeChild(clearDialog);
        if (overlay) document.body.removeChild(overlay);
    }
};

console.log("chatClearUI.js loaded.");
