/**
 * Loads the Clear System Log Button HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadClearSystemLogButton() {
    const placeholder = document.getElementById('clear-system-log-button-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for Clear System Log Button not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<!-- Clear System Log Button Component -->
<button id="clearSystemLogButton" class="mdl-button mdl-js-button mdl-button--raised mdl-button--accent" style="margin-left: 10px; background-color: #ff9800;">
    <i class="material-icons" style="vertical-align: middle; margin-right: 4px;">delete_sweep</i>
    Clear System Log
</button>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('Clear System Log Button HTML loaded and MDL components upgraded.');

        // Initialize the handler after the HTML is loaded
        if (window.CommunicationPanel &&
            window.CommunicationPanel.ClearSystemLogCommunicationPanel &&
            typeof window.CommunicationPanel.ClearSystemLogCommunicationPanel.initializeClearSystemLogHandler === 'function') {

            window.CommunicationPanel.ClearSystemLogCommunicationPanel.initializeClearSystemLogHandler();
            console.log('Clear System Log handler initialized from loader.');
        } else {
            console.error('ClearSystemLogCommunicationPanel namespace or initializeClearSystemLogHandler function not found.');
        }

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Clear System Log Button:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadClearSystemLogButton = loadClearSystemLogButton; 