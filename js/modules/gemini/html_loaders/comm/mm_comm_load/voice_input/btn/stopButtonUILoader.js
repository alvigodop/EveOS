/**
 * Loads the Stop Button HTML component.
 */

async function loadStopButton() {
    const placeholder = document.getElementById('stop-button-placeholder');
    if (!placeholder) {
        console.warn('Stop Button placeholder not found.');
        return false; // Indicate failure
    }

    try {
        const html = `
<button id="stopButton"
    class="mdl-button mdl-js-button mdl-button--fab mdl-button--mini-fab gemini-command-icon-btn gemini-command-icon-btn--muted"
    title="Stop Voice Input">
    <i class="material-icons">mic_off</i>
</button>
`;
        placeholder.innerHTML = html;

        // Upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('Stop Button HTML loaded and MDL components upgraded.');

        return true; // Indicate success

    } catch (error) {
        console.error('Error loading Stop Button HTML:', error);
        return false; // Indicate failure
    }
}

// Expose the loader function globally or via a namespace
window.loadStopButton = loadStopButton; 
