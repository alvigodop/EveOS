/**
 * Toggles the visibility of the past chats log section and updates the toggle button's icon.
 * Relies on the global variable `isPastChatsVisible` (expected to be defined in main.js or a shared scope) 
 * and DOM elements with IDs:
 * - `pastChatsLog`: The container for past chats.
 * - `togglePastChatsButton`: The button that triggers this toggle.
 */
let pastChatsVisible = false;

function togglePastChats() {
    const pastChatsLog = document.getElementById('pastChatsLog');
    const toggleButton = document.getElementById('togglePastChatsButton');

    const chatContainer = document.querySelector('.chat-container');

    // isPastChatsVisible is a global variable expected to be defined in main.js or a shared scope
    pastChatsVisible = !pastChatsVisible;

    if (pastChatsLog) {
        pastChatsLog.style.display = pastChatsVisible ? 'flex' : 'none'; // Changed to flex to match our layout
    } else {
        console.error("Element with ID 'pastChatsLog' not found for toggling visibility.");
    }

    if (chatContainer) {
        if (pastChatsVisible) {
            chatContainer.classList.add('past-chats-visible');
        } else {
            chatContainer.classList.remove('past-chats-visible');
        }
    }

    if (toggleButton && toggleButton.querySelector('i')) {
        toggleButton.querySelector('i').textContent = pastChatsVisible ? 'history_toggle_on' : 'history_toggle_off';
    } else {
        console.error("Element with ID 'togglePastChatsButton' or its icon not found for toggling visibility.");
    }
}

// Ensure the namespace exists
window.CommunicationPanel = window.CommunicationPanel || {};
window.CommunicationPanel.TogglePastChatsCommunicationPanel = window.CommunicationPanel.TogglePastChatsCommunicationPanel || {};
window.CommunicationPanel.TogglePastChatsCommunicationPanel.PastChatsUI = window.CommunicationPanel.TogglePastChatsCommunicationPanel.PastChatsUI || {};

function initializePastChatsVisibilityToggler() {
    const toggleButton = document.getElementById('togglePastChatsButton');
    if (toggleButton) {
        if (toggleButton.dataset.pastChatsBound === '1') return;
        toggleButton.dataset.pastChatsBound = '1';
        toggleButton.addEventListener('click', togglePastChats);
        console.log('Past Chats Visibility Toggler initialized.');
    } else {
        console.warn("Element 'togglePastChatsButton' not found for pastChatsVisibilityToggler initialization.");
    }
}

window.CommunicationPanel.TogglePastChatsCommunicationPanel.PastChatsUI.initializePastChatsVisibilityToggler = initializePastChatsVisibilityToggler;
