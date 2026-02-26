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
<div class="agentic-function-card" style="background-color: white; padding: 12px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); min-width: 200px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 500; color: #333;">Conversation Memory</span>
        <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="contextMemoryToggle">
            <input type="checkbox" id="contextMemoryToggle" class="mdl-switch__input" checked>
            <span class="mdl-switch__label"></span>
        </label>
    </div>
    <div style="font-size: 12px; color: #757575; margin-top: 8px;">
        Provides chat history as context for more coherent responses
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