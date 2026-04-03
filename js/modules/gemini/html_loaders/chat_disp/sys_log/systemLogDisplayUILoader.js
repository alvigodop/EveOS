/**
 * Loads the System Log Display HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadSystemLogDisplay() {
    const placeholder = document.getElementById('system-log-display-placeholder');
    if (!placeholder) {
        console.error('Placeholder for System Log Display not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<div id="systemLog" class="mdl-shadow--2dp gemini-system-log">
    <div class="system-header gemini-system-header">
        <div class="gemini-system-header-main">
            <div class="gemini-system-kicker">Telemetry Feed</div>
            <span class="gemini-system-title">System Messages</span>
            <div class="gemini-system-header-copy">Connection, voice, and runtime notices stay scoped to this workspace.</div>
        </div>
        <div class="gemini-system-header-actions">
            <button id="rebootButton" class="mdl-button mdl-js-button gemini-system-reboot-btn" style="display: none;">
                <i class="material-icons">refresh</i>
                Reboot Server
            </button>
        </div>
    </div>
    <div class="system-messages-container gemini-system-messages"></div>
</div>
`;
        placeholder.innerHTML = htmlContent;

        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }

        if (window.LogInterfaceDisplay &&
            window.LogInterfaceDisplay.MessagingSystemLog &&
            window.LogInterfaceDisplay.MessagingSystemLog.ServerRebootButton &&
            typeof window.LogInterfaceDisplay.MessagingSystemLog.ServerRebootButton.initializeServerRebootButton === 'function') {
            window.LogInterfaceDisplay.MessagingSystemLog.ServerRebootButton.initializeServerRebootButton();
            console.log('Server reboot button initialized after system log display HTML loaded');
        }

        if (typeof window.initializeSystemLogDisplay === 'function') {
            window.initializeSystemLogDisplay();
            console.log('System log display initialized and pending messages flushed');
        }

        if (window.MessagingSystemLog && typeof window.MessagingSystemLog.displayMessage === 'function') {
            window.MessagingSystemLog.displayMessage('System Message: System log display initialized');
        }

        console.log('System Log Display component loaded and upgraded successfully');
        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load System Log Display:', error);
        return Promise.reject(error);
    }
}

window.loadSystemLogDisplay = loadSystemLogDisplay;
