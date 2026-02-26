/**
 * Loads the Send Button HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadSendButtonCard() {
    const placeholder = document.getElementById('send-button-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for Send Button card not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<button id="sendButton" class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored">
    Send
</button>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('Send Button card loaded and MDL components upgraded.');
        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Send Button card:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadSendButtonCard = loadSendButtonCard; 