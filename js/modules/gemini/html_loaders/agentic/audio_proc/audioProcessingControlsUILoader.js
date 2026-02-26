/**
 * Loads the Audio Processing Controls card HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadAudioProcessingControlsCard() {
    const placeholder = document.getElementById('audio-processing-controls-card-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Audio Processing Controls card not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<!-- Audio Processing Controls Card Component -->
<div class="agentic-function-card" style="background-color: white; padding: 12px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); min-width: 200px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 500; color: #333;">Audio Processing Controls</span>
        <div style="display: flex; align-items: center;">
            <button id="audioSettingsButton" class="mdl-button mdl-js-button mdl-button--icon" style="margin-right: 8px;">
                <i class="material-icons">settings_audio</i>
            </button>
            <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="playProcessedAudioToggle">
                <input type="checkbox" id="playProcessedAudioToggle" class="mdl-switch__input">
                <span class="mdl-switch__label"></span>
            </label>
        </div>
    </div>
    <div style="font-size: 12px; color: #757575;">
        Enable playback of the final processed audio message
    </div>
</div>
`;
        placeholder.innerHTML = htmlContent;
        // Manually upgrade MDL components within the loaded HTML
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }
        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Audio Processing Controls card:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by pageInitializer.js
window.loadAudioProcessingControlsCard = loadAudioProcessingControlsCard; 