/**
 * Loads the Screen Share Button HTML component.
 */
async function loadScreenShareButton() {
    const placeholder = document.getElementById('screen-share-button-placeholder');
    if (!placeholder) {
        console.warn('Screen Share Button placeholder not found.');
        return false; // Indicate failure
    }

    try {
        const html = `
<button id="screenShareButton"
    class="mdl-button mdl-js-button mdl-button--fab mdl-button--mini-fab gemini-command-icon-btn gemini-command-icon-btn--screen"
    title="Toggle Screen Share">
    <i class="material-icons">screen_share</i>
</button>
`;
        placeholder.innerHTML = html;

        // Upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder.firstElementChild);
        }
        console.log('Screen Share Button HTML loaded and MDL components upgraded.');
        return placeholder.firstElementChild; // Indicate success and return the button

    } catch (error) {
        console.error('Error loading Screen Share Button HTML:', error);
        return false; // Indicate failure
    }
}

// Expose the loader function globally or via a namespace
window.loadScreenShareButton = loadScreenShareButton; 
