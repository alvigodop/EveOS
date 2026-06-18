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
<div id="chatLog" class="mdl-shadow--2dp gemini-chat-log" data-collapsible-section="conversation">
    <div class="chat-header gemini-chat-header" data-collapsible-header>
        <div class="gemini-chat-header-copy">
            <div class="gemini-chat-kicker">Conversation Feed</div>
            <span class="gemini-chat-title">Conversations</span>
        </div>
        <div class="gemini-chat-header-actions">
            <button type="button" class="gemini-log-copy-btn" data-gemini-copy-log="chat" title="Copy conversation messages">
                <i class="material-icons" aria-hidden="true">content_copy</i>
                <span>Copy</span>
            </button>
            <div class="gemini-chat-header-pill">Live</div>
        </div>
    </div>
    <div class="chat-messages-container gemini-chat-messages" data-collapsible-body></div>
</div>
`;
        placeholder.innerHTML = htmlContent;

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

window.loadMainChatLog = loadMainChatLog;
