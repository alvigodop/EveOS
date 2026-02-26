/**
 * Loads the Chat Container Layout HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadChatContainer() {
    const placeholder = document.getElementById('chat-container-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for Chat Container not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<!-- Chat Container Layout Component -->
    <!-- Main Chat Log Placeholder - loaded by mainChatLogUILoader.js -->
    <div id="main-chat-log-placeholder"></div>
    <div id="previous-conversation-log-placeholder"></div>
    <div id="system-log-display-placeholder"></div>
    <div id="pastChatsLog" class="mdl-shadow--2dp"></div>
`;
        placeholder.innerHTML = htmlContent;

        // Manually upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('Chat Container HTML loaded and MDL components upgraded.');

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Chat Container:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadChatContainer = loadChatContainer; 