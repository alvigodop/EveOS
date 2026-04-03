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
<button id="sendButton" class="gemini-send-btn" type="button">
    <span>Send</span>
    <i class="material-icons" aria-hidden="true">arrow_upward</i>
</button>
`;
        placeholder.innerHTML = htmlContent;
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

window.loadSendButtonCard = loadSendButtonCard;
