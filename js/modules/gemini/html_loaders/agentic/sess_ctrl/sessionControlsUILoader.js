/**
 * Loads the Session Controls card HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadSessionControlsCard() {
    const placeholder = document.getElementById('session-controls-card-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Session Controls card not found!');
        return Promise.reject('Placeholder not found'); // Return a rejected promise
    }

    try {
        // The path should be relative to gemini_chat_interface.html
        const htmlContent = `
<!-- Session Controls Card Component -->
<div class="agentic-function-card" style="background-color: white; padding: 12px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); min-width: 200px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 500; color: #333;">Session Controls</span>
        <button id="sessionControlsSettingsButton" class="mdl-button mdl-js-button mdl-button--icon">
            <i class="material-icons">settings</i>
        </button>
    </div>
    <div style="font-size: 12px; color: #757575; margin-top: 8px;">
        Configure keep-alive pings and cleanup interval
    </div>
</div>
`;
        placeholder.innerHTML = htmlContent;
        // After loading, you might need to manually upgrade MDL components within the loaded HTML
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }
        return Promise.resolve(); // Resolve the promise on success

    } catch (error) {
        console.error('Failed to load Session Controls card:', error);
        return Promise.reject(error); // Return a rejected promise on error
    }
}

/**
 * Loads the Session Controls Settings Dialog loader script.
 * Returns a Promise that resolves when the script is loaded.
 */
function loadSessionControlsSettingsDialogScript() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/agentic/sess_ctrl/sessionControlsSettingsDialogUILoader.js';
        script.defer = true;
        script.onload = () => {
            console.log('Session Controls Settings Dialog UI Loader script loaded.');
            resolve();
        };
        script.onerror = (error) => {
            console.error('Failed to load Session Controls Settings Dialog UI Loader script:', error);
            reject(error);
        };
        document.body.appendChild(script);
    });
}

// Export the functions to be called by the agentic HTML loaders
window.loadSessionControlsCard = loadSessionControlsCard;
window.loadSessionControlsSettingsDialogScript = loadSessionControlsSettingsDialogScript; 