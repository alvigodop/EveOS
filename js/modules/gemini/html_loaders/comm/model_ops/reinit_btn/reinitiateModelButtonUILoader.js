/**
 * Loads the Reinitiate Model Button HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadReinitiateModelButtonCard() {
    const placeholder = document.getElementById('reinitiate-model-button-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for Reinitiate Model Button card not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<button id="initiateModelButton"
    class="mdl-button mdl-js-button mdl-button--fab mdl-button--mini-fab gemini-command-icon-btn gemini-command-icon-btn--model"
    title="Reinitiate Model">
    <i class="material-icons">smart_toy</i>
</button>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('Reinitiate Model Button card loaded and MDL components upgraded.');

        // Initialize the handler after the HTML is loaded
        if (window.CommunicationPanel &&
            window.CommunicationPanel.ReinitiateModelCommunicationPanel &&
            typeof window.CommunicationPanel.ReinitiateModelCommunicationPanel.initializeModelInitializer === 'function') {

            window.CommunicationPanel.ReinitiateModelCommunicationPanel.initializeModelInitializer();
            console.log('Model Initializer handler initialized from loader.');
        } else {
            console.debug('Model initializer deferred until Communication Panel handlers are ready.');
        }

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Reinitiate Model Button card:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadReinitiateModelButtonCard = loadReinitiateModelButtonCard; 
