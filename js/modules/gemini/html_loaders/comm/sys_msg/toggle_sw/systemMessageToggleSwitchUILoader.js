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
<label class="gemini-command-switch gemini-command-switch--dock" for="systemMessagesToggle">
    <input type="checkbox" id="systemMessagesToggle" class="gemini-command-switch-input" checked>
    <span class="gemini-command-switch-track" aria-hidden="true">
        <span class="gemini-command-switch-thumb"></span>
    </span>
    <span class="gemini-command-switch-copy">
        <span class="gemini-command-switch-kicker">System Log</span>
        <span class="gemini-command-switch-label">Messages</span>
    </span>
</label>
`;
        placeholder.innerHTML = htmlContent;
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('System Message Toggle Switch HTML loaded and MDL components upgraded.');

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

window.loadSystemMessageToggleSwitch = loadSystemMessageToggleSwitch;
