// js/modules/gemini/conversation_history_ui/conversationHistoryToggler.js

// Ensure the namespace exists
window.CommunicationPanel = window.CommunicationPanel || {};
window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel = window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel || {};
window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI = window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI || {};

// Define toggleConversationHistory in the namespace
window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.toggleConversationHistory = function() {
    const previousConversationLog = document.getElementById('previousConversationLog');
    // Check if previousConversationLog exists to prevent errors if called too early or element is missing
    if (!previousConversationLog) {
        console.error("Element with ID 'previousConversationLog' not found.");
        return;
    }
    const isVisible = previousConversationLog.style.display !== 'none';

    if (!isVisible) {
        // If showing history, first reset the state
        // resetHistoryState is expected to be a global function
        if (typeof resetHistoryState === 'function') {
            resetHistoryState();
        } else {
            console.error('resetHistoryState function not found.');
        }

        previousConversationLog.style.display = 'block';

        const toggleButton = document.getElementById('toggleHistoryButton'); // Get button for icon update

        // webSocket is expected to be a global variable
        if (typeof window.webSocket !== 'undefined' && window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
            window.webSocket.send(JSON.stringify({ command: "get_history" }));
            if (toggleButton && toggleButton.querySelector('i')) {
                toggleButton.querySelector('i').textContent = 'history_toggle_on';
            }
        } else {
            if (toggleButton && toggleButton.querySelector('i')) {
                toggleButton.querySelector('i').textContent = 'history_toggle_on';
            }
            const previousConversationContent = document.getElementById('previousConversationContent');
            if (previousConversationContent) {
                previousConversationContent.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #f44336;">
                    <i class="material-icons" style="font-size: 48px;">cloud_off</i>
                    <p>Cannot load history - no connection to server</p>
                </div>`;
            }
        }
    } else {
        previousConversationLog.style.display = 'none';
        const toggleButton = document.getElementById('toggleHistoryButton'); // Get button for icon update
        if (toggleButton && toggleButton.querySelector('i')) {
            toggleButton.querySelector('i').textContent = 'history';
        }
    }
}

// Also expose as global for backward compatibility with inline onclick handlers
window.toggleConversationHistory = window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.toggleConversationHistory;

// Expose an initialization function
window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.initializeConversationHistoryToggler = function() {
    const toggleHistoryButton = document.getElementById('toggleHistoryButton');

    if (toggleHistoryButton) {
        // The event listener for 'toggleHistoryButton' itself
        toggleHistoryButton.addEventListener('click', window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.toggleConversationHistory);
        console.log('Conversation history toggler initialized.');
    } else {
        console.error("Element with ID 'toggleHistoryButton' not found for conversation history toggler.");
    }
    // The inline onclick for 'hidePreviousConversationButton' in previous_conversation_log_card.html 
    // needs to be updated to call the namespaced function if this script is loaded after the HTML card.
    // Or, attach the listener here explicitly if the button is guaranteed to be present.
    const hideButton = document.getElementById('hidePreviousConversationButton');
    if (hideButton) {
        hideButton.onclick = null; // Remove existing inline handler if any
        hideButton.addEventListener('click', window.CommunicationPanel.ToggleConversationHistoryCommuicationPanel.ConversationHistoryUI.toggleConversationHistory);
    }
}; 