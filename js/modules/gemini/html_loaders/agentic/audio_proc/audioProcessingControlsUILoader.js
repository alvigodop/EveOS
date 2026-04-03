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
<div class="agentic-function-card gemini-agentic-card gemini-agentic-card--audio">
    <div class="gemini-agentic-card-head">
        <div>
            <div class="gemini-agentic-card-kicker">Audio Pipeline</div>
            <span class="gemini-agentic-card-title">Audio Processing Controls</span>
        </div>
        <div class="gemini-agentic-card-actions">
            <button id="audioSettingsButton" class="mdl-button mdl-js-button mdl-button--icon gemini-agentic-icon-btn">
                <i class="material-icons">settings_audio</i>
            </button>
            <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect gemini-agentic-switch" for="playProcessedAudioToggle">
                <input type="checkbox" id="playProcessedAudioToggle" class="mdl-switch__input">
                <span class="mdl-switch__label"></span>
            </label>
        </div>
    </div>
    <div class="gemini-agentic-card-copy">
        Enable playback of the final processed audio message
    </div>
</div>
`;
        placeholder.innerHTML = htmlContent;
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }
        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Audio Processing Controls card:', error);
        return Promise.reject(error);
    }
}

window.loadAudioProcessingControlsCard = loadAudioProcessingControlsCard;
