/**
 * Loads the Screen Capture Interval card HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadScreenCaptureSettingsCard() {
    const placeholder = document.getElementById('screen-capture-settings-card-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Screen Capture Interval card not found!');
        return Promise.reject('Placeholder not found'); // Return a rejected promise
    }

    try {
        const htmlContent = `
<!-- Screen Capture Interval Card Component -->
<div class="agentic-function-card" style="background-color: white; padding: 12px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); min-width: 200px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 500; color: #333;">Screen Capture Interval</span>
        <div style="display: flex; align-items: center;">
            <button id="screenCaptureSettingsButton" class="mdl-button mdl-js-button mdl-button--icon">
                <i class="material-icons">settings</i>
            </button>
        </div>
    </div>
    <div style="font-size: 12px; color: #757575; margin-top: 8px;">
        Interval in seconds between periodic screen captures when sharing
    </div>
</div>
`;
        placeholder.innerHTML = htmlContent;
        // After loading, you might need to manually upgrade MDL components within the loaded HTML
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }

        // Set the initial state of the settings button based on screen sharing state
        const settingsButton = document.getElementById('screenCaptureSettingsButton');
        if (settingsButton && typeof window.isScreenShared !== 'undefined') {
            settingsButton.disabled = !window.isScreenShared;
        } else if (settingsButton) {
            console.warn('window.isScreenShared not defined when initializing screenCaptureSettingsUILoader.js. Button state may be incorrect.');
            settingsButton.disabled = true; // Default to disabled if state is unknown
        }

        return Promise.resolve(); // Resolve the promise on success

    } catch (error) {
        console.error('Failed to load Screen Capture Interval card:', error);
        return Promise.reject(error); // Return a rejected promise on error
    }
}

/**
 * Loads the Screen Capture Settings Dialog HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadScreenCaptureSettingsDialog() {
    const placeholder = document.getElementById('screen-capture-settings-dialog-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Screen Capture Settings Dialog not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<!-- Screen Capture Settings Dialog Component -->
<dialog id="screenCaptureSettingsDialog" class="mdl-dialog" style="width: 300px;">
    <h4 class="mdl-dialog__title">Screen Capture Settings</h4>
    <div class="mdl-dialog__content">
        <label for="screenCaptureIntervalInput" style="font-size:12px; color:#333;">Interval (ms):</label>
        <input type="number" id="screenCaptureIntervalInput" min="100" max="10000" step="100" value="1000" style="width:60px;">
    </div>
    <div class="mdl-dialog__actions">
        <button type="button" class="mdl-button" id="screenCaptureSettingsCancel">Cancel</button>
        <button type="button" class="mdl-button" id="screenCaptureSettingsSave">Save</button>
    </div>
</dialog>
`;
        placeholder.innerHTML = htmlContent;

        // Upgrade MDL components within the loaded HTML
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }

        // Initialize the dialog polyfill if needed
        const dialog = document.getElementById('screenCaptureSettingsDialog');
        if (dialog && typeof window.dialogPolyfill !== 'undefined') {
            window.dialogPolyfill.registerDialog(dialog);
        }

        console.log('Screen Capture Settings Dialog loaded successfully.');
        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Screen Capture Settings Dialog:', error);
        return Promise.reject(error);
    }
}

/**
 * Initializes the Screen Capture Settings button handler.
 */
function initializeScreenCaptureSettingsHandler() {
    console.log('ScreenCaptureSettingsAgentic.initializeScreenCaptureSettingsHandler called.');
    const settingsButton = document.getElementById('screenCaptureSettingsButton');
    const settingsDialog = document.getElementById('screenCaptureSettingsDialog');
    const cancelButton = settingsDialog ? settingsDialog.querySelector('#screenCaptureSettingsCancel') : null;
    const saveButton = settingsDialog ? settingsDialog.querySelector('#screenCaptureSettingsSave') : null;

    if (!settingsButton || !settingsDialog) {
        console.error('One or more Screen Capture Settings dialog elements not found. Handler will not be fully initialized.');
        return;
    }

    // Show the dialog when the settings button is clicked
    settingsButton.addEventListener('click', () => {
        console.log('Screen Capture Settings button clicked. Opening dialog.');

        // Restore current setting
        const currentInterval = localStorage.getItem('screenCaptureInterval') || '1000';
        const input = document.getElementById('screenCaptureIntervalInput');
        if (input) {
            input.value = currentInterval;
        }

        if (settingsDialog.showModal) {
            settingsDialog.showModal();
        } else {
            console.error('Dialog API not supported.');
            settingsDialog.style.display = 'block';
        }
    });

    // Close the dialog when the cancel button is clicked
    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            console.log('Screen Capture Settings dialog Cancel button clicked.');
            if (settingsDialog.close) {
                settingsDialog.close();
            } else {
                settingsDialog.style.display = 'none';
            }
        });
    }

    // Close the dialog and save settings (if any) when the save button is clicked
    if (saveButton) {
        saveButton.addEventListener('click', () => {
            console.log('Screen Capture Settings dialog Save button clicked.');

            const input = document.getElementById('screenCaptureIntervalInput');
            if (input) {
                let interval = parseInt(input.value, 10);
                if (isNaN(interval) || interval < 100) interval = 1000;

                // Save to localStorage
                localStorage.setItem('screenCaptureInterval', interval.toString());

                // Update global if available
                window.screenCaptureIntervalGlobal = interval;

                if (typeof window.displayMessage === 'function') {
                    window.displayMessage(`System Message: Screen capture interval set to ${interval}ms`, true);
                }
            }

            if (settingsDialog.close) {
                settingsDialog.close();
            } else {
                settingsDialog.style.display = 'none';
            }
        });
    }

    console.log('Screen Capture Settings Handler initialized successfully.');
}

// Export the functions to be called by pageInitializer.js
window.loadScreenCaptureSettingsCard = loadScreenCaptureSettingsCard;
window.loadScreenCaptureSettingsDialog = loadScreenCaptureSettingsDialog;
window.ScreenCaptureSettingsAgentic = window.ScreenCaptureSettingsAgentic || {};
window.ScreenCaptureSettingsAgentic.initializeScreenCaptureSettingsHandler = initializeScreenCaptureSettingsHandler; 