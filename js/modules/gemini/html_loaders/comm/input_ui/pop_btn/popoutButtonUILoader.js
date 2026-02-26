/**
 * Loads the Popout Button HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadPopoutButtonCard() {
    const placeholder = document.getElementById('popout-button-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for Popout Button card not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<!-- Popout Button Component -->
<button id="popoutButton" class="mdl-button mdl-js-button mdl-button--icon" title="Popout Chat">
    <i class="material-icons">open_in_new</i>
</button>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('Popout Button card loaded and MDL components upgraded.');

        // Initialize the popout chat feature after the button is loaded
        if (window.LogInterfaceDisplay &&
            window.LogInterfaceDisplay.MessagingInterface &&
            window.LogInterfaceDisplay.MessagingInterface.PopoutChatFeature &&
            typeof window.LogInterfaceDisplay.MessagingInterface.PopoutChatFeature.initializePopoutChatFeature === 'function') {

            window.LogInterfaceDisplay.MessagingInterface.PopoutChatFeature.initializePopoutChatFeature();
            console.log('Popout chat feature initialized from loader.');
        } else {
            console.error('PopoutChatFeature namespace or initializePopoutChatFeature function not found.');
        }

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Popout Button card:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadPopoutButtonCard = loadPopoutButtonCard; 