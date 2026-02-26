/**
 * Load Main Chat Log HTML Component
 * Loads the main chat log HTML component and inserts it into the page.
 */

async function loadMainChatLog() {
    console.log('Loading Main Chat Log component...');

    const placeholder = document.getElementById('main-chat-log-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Main Chat Log not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<!-- Main Chat Log Component -->
<div id="chatLog" class="mdl-shadow--2dp">
    <div class="chat-header">
        <span>Conversations</span>
    </div>
    <div class="chat-messages-container"></div>
</div>
`;
        placeholder.innerHTML = htmlContent;

        // Upgrade any MDL components in the loaded HTML
        if (typeof componentHandler !== 'undefined' && componentHandler.upgradeElements) {
            componentHandler.upgradeElements(placeholder);
        }

        console.log('Main Chat Log component loaded and upgraded successfully');
        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Main Chat Log:', error);
        return Promise.reject(error);
    }
}

// Export the function to window for global access
window.loadMainChatLog = loadMainChatLog; 