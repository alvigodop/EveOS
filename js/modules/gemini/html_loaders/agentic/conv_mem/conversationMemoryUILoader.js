/**
 * Loads the Conversation Memory card HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadConversationMemoryCard() {
    const placeholder = document.getElementById('conversation-memory-card-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Conversation Memory card not found!');
        return Promise.reject('Placeholder not found'); // Return a rejected promise
    }

    try {
        const htmlContent = `
<!-- Conversation Memory Card Component -->
<div class="agentic-function-card gemini-agentic-card gemini-agentic-card--memory">
    <div class="gemini-agentic-card-head">
        <div>
            <div class="gemini-agentic-card-kicker">Memory Relay</div>
            <span class="gemini-agentic-card-title">Conversation Memory</span>
        </div>
        <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect gemini-agentic-switch" for="contextMemoryToggle">
            <input type="checkbox" id="contextMemoryToggle" class="mdl-switch__input" checked>
            <span class="mdl-switch__label"></span>
        </label>
    </div>
    <div class="gemini-agentic-card-copy">
        Provides chat history as context for more coherent responses.
    </div>
</div>
`;
        placeholder.innerHTML = htmlContent;
        // After loading, you might need to manually upgrade MDL components within the loaded HTML
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }
        return Promise.resolve(); // Resolve the promise on success

    } catch (error) {
        console.error('Failed to load Conversation Memory card:', error);
        return Promise.reject(error); // Return a rejected promise on error
    }
}

// Export the function to be called by pageInitializer.js
window.loadConversationMemoryCard = loadConversationMemoryCard; 
