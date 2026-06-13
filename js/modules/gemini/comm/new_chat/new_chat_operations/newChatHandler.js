function startNewChat() {
    if (confirm("Start a new chat? Current chat will be saved to past chats.")) {
        try {
            // Save current chat if not empty
            const chatLog = document.getElementById('chatLog');
            const currentChat = chatLog ? chatLog.innerHTML : '';

            if (currentChat && currentChat.trim()) {
                const timestamp = new Date().toLocaleString();

                // Robust voice selection retrieval
                let voiceValue = "default";
                const voiceSelectElement = document.getElementById('voiceSelect');
                if (voiceSelectElement) {
                    voiceValue = voiceSelectElement.value;
                } else {
                    console.warn("voiceSelect element not found, using default.");
                }

                // Ensure global pastChats array exists
                if (typeof window.pastChats !== 'undefined') {
                    window.pastChats.push({
                        timestamp: timestamp,
                        voice: voiceValue,
                        content: currentChat
                    });
                } else {
                    console.error("Global 'window.pastChats' array not found. Chat history not saved.");
                }

                // Call update display if available
                if (typeof window.updatePastChatsDisplay === 'function') {
                    window.updatePastChatsDisplay();
                } else {
                    console.warn("Global 'updatePastChatsDisplay' function not found.");
                }
            }

            // Clear current chat and hide previous conversation
            if (chatLog) chatLog.innerHTML = '';

            const prevLog = document.getElementById('previousConversationLog');
            if (prevLog) prevLog.style.display = 'none';

            // Clear localStorage
            localStorage.removeItem('geminiChatHistory');

            // Call connection management functions defensively
            if (typeof window.resetConnection === 'function') {
                window.resetConnection();
            } else {
                console.error("Global 'resetConnection' function not found.");
            }

            if (typeof window.displayMessage === 'function') {
                window.displayMessage("System Message: Starting new chat...");
            } else {
                console.warn("Global 'displayMessage' function not found.");
            }

            setTimeout(() => {
                if (typeof window.connect === 'function') {
                    window.connect();
                } else {
                    console.error("Global 'connect' function not found.");
                }
            }, 1000);

        } catch (error) {
            console.error("Error in startNewChat:", error);
        }
    }
}

// Ensure the namespace exists
window.CommunicationPanel = window.CommunicationPanel || {};
window.CommunicationPanel.StartNewChatCommunicationPanel = window.CommunicationPanel.StartNewChatCommunicationPanel || {};

// Encapsulate the initialization logic
window.CommunicationPanel.StartNewChatCommunicationPanel.initializeNewChatHandler = function () {
    const newChatButton = document.getElementById('newChatButton');
    if (newChatButton) {
        if (newChatButton.dataset.newChatBound === '1') return;
        newChatButton.dataset.newChatBound = '1';
        newChatButton.addEventListener('click', startNewChat);
        console.log('New Chat Button event listener attached by initializeNewChatHandler.');
    } else {
        console.error('New Chat Button (newChatButton) not found when attempting to attach listener in initializeNewChatHandler.');
    }
};

// Check if the button already exists (in case UI loaded before this script)
if (document.getElementById('newChatButton')) {
    window.CommunicationPanel.StartNewChatCommunicationPanel.initializeNewChatHandler();
}
