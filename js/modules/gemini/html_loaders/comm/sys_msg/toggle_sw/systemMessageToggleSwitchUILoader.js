/**
 * Loads the System Message Toggle Switch HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadSystemMessageToggleSwitch() {
    const placeholder = document.getElementById('system-message-toggle-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for System Message Toggle Switch not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="systemMessagesToggle">
    <input type="checkbox" id="systemMessagesToggle" class="mdl-switch__input" checked>
    <span class="mdl-switch__label">System Messages</span>
</label>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('System Message Toggle Switch HTML loaded and MDL components upgraded.');

        // Initialize the handler after the HTML is loaded
        if (window.CommunicationPanel &&
            window.CommunicationPanel.SystemMessageToggleCommunicationPanel &&
            typeof window.CommunicationPanel.SystemMessageToggleCommunicationPanel.initializeSystemMessageToggleHandler === 'function') {

            window.CommunicationPanel.SystemMessageToggleCommunicationPanel.initializeSystemMessageToggleHandler();
            console.log('System Message Toggle handler initialized from loader.');
        } else {
            console.error('SystemMessageToggleCommunicationPanel namespace or initializeSystemMessageToggleHandler function not found.');
        }

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load System Message Toggle Switch HTML:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadSystemMessageToggleSwitch = loadSystemMessageToggleSwitch; 