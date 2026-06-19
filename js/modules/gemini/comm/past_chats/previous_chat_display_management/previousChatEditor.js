function confirmPreviousChatAction(message) {
    if (typeof window.showConfirmWithTitle === 'function') {
        return window.showConfirmWithTitle('Gemini Previous Chat', message, { confirmText: 'Clear', cancelText: 'Cancel' });
    }
    if (typeof window.showConfirm === 'function') {
        return window.showConfirm(message, { confirmText: 'Clear', cancelText: 'Cancel' });
    }
    if (typeof displayMessage === 'function') {
        displayMessage('System Message: Confirmation dialog is not available yet. Try again after the workspace finishes loading.', true);
    }
    return Promise.resolve(false);
}

async function clearPreviousChat() {
    if (await confirmPreviousChatAction("Clear this previous chat section?")) {
        document.getElementById('previousConversationContent').innerHTML = '';
        displayMessage("System Message: Previous chat section cleared");
    }
}

function editPreviousChat() {
    const content = document.getElementById('previousConversationContent');
    const messages = content.getElementsByClassName('chat-message');
    
    // Make messages editable
    Array.from(messages).forEach(message => {
        message.contentEditable = true;
        message.style.border = '1px dashed #673ab7';
        message.style.padding = '15px';
    });
    
    // Add save button
    const saveButton = document.createElement('button');
    saveButton.className = 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored';
    saveButton.style.backgroundColor = '#4CAF50';
    saveButton.innerHTML = '<i class="material-icons" style="vertical-align: middle; margin-right: 4px;">save</i>Save Changes';
    saveButton.onclick = () => savePreviousChatEdits();
    
    const controls = content.querySelector('.previous-chat-controls');
    controls.insertBefore(saveButton, controls.firstChild);
}

function savePreviousChatEdits() {
    const content = document.getElementById('previousConversationContent');
    const messages = content.getElementsByClassName('chat-message');
    
    // Remove editable state
    Array.from(messages).forEach(message => {
        message.contentEditable = false;
        message.style.border = '';
        message.style.padding = '12px 16px';
    });
    
    // Remove save button
    const saveButton = content.querySelector('.previous-chat-controls button:first-child');
    if (saveButton && saveButton.innerHTML.includes('save')) {
        saveButton.remove();
    }
    
    displayMessage("System Message: Previous chat edits saved");
} 
