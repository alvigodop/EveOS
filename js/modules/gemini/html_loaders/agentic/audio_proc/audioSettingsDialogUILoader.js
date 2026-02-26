/**
 * Loads the Audio Settings Dialog HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadAudioSettingsDialog() {
    const placeholder = document.getElementById('audio-settings-dialog-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Audio Settings Dialog not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<!-- Audio Processing Settings Dialog Component -->
<dialog id="audioSettingsDialog" class="mdl-dialog" style="width: 360px;">
    <h4 class="mdl-dialog__title">Audio Processing Settings</h4>
    <div class="mdl-dialog__content">
        <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="autoAudioPlayToggle">
            <input type="checkbox" id="autoAudioPlayToggle" class="mdl-switch__input">
            <span class="mdl-switch__label">Auto Audio Play</span>
        </label>
        <br>
        <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="sequentialAudioPlayToggle">
            <input type="checkbox" id="sequentialAudioPlayToggle" class="mdl-switch__input">
            <span class="mdl-switch__label">Sequential Audio Play</span>
        </label>
        <br>
        <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="playInterimAudioToggle">
            <input type="checkbox" id="playInterimAudioToggle" class="mdl-switch__input">
            <span class="mdl-switch__label">Play Interim Audio Chunks</span>
        </label>
        <br>
        <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="voiceAnnouncementsToggle">
            <input type="checkbox" id="voiceAnnouncementsToggle" class="mdl-switch__input">
            <span class="mdl-switch__label">Voice Announcements</span>
        </label>
        <br>
        <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
            <label for="processedAudioDelayInput" style="font-size: 12px; color: #333;">Processed Audio Delay (ms):</label>
            <input type="number" id="processedAudioDelayInput" min="0" value="0" style="width: 60px;">
        </div>
        <br>

        <!-- Voice selection moved into Audio Processing Settings -->
        <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label" style="margin-top: 12px;">
            <select id="voiceSelect" class="mdl-textfield__input">
                <option value="Aoede" selected>Aoede</option>
                <option value="Charon">Charon</option>
                <option value="Fenrir">Fenrir</option>
                <option value="Kore">Kore</option>
                <option value="Leda">Leda</option>
                <option value="Orus">Orus</option>
                <option value="Puck">Puck</option>
                <option value="Zephyr">Zephyr</option>
            </select>
            <label class="mdl-textfield__label" for="voiceSelect">Voice</label>
        </div>
        
        <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
             <label for="speakingRateInput" style="font-size: 12px; color: #333; width: 100px;">Speaking Rate:</label>
             <input type="number" id="speakingRateInput" min="0.5" max="2.0" step="0.1" value="1.0" style="width: 60px;">
        </div>
        
        <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
             <label for="pitchInput" style="font-size: 12px; color: #333; width: 100px;">Pitch (-20 to 20):</label>
             <input type="number" id="pitchInput" min="-20" max="20" step="1" value="0" style="width: 60px;">
        </div>
        
        <br>
        <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="stopAudioOnInputToggle">
            <input type="checkbox" id="stopAudioOnInputToggle" class="mdl-switch__input">
            <span class="mdl-switch__label">Stop Audio on User Input</span>
        </label>        <br>
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e0e0e0;">
            <p style="font-size: 13px; color: #444; margin-bottom: 4px;"><strong>Prompt Injection Tool</strong></p>
            <p style="font-size: 11px; color: #777; margin-bottom: 8px;">Inject custom instructions into the model's system prompt.</p>
            <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="transcriptionModeToggle">
                <input type="checkbox" id="transcriptionModeToggle" class="mdl-switch__input">
                <span class="mdl-switch__label" id="injectionToggleLabel">Enable Prompt Injection</span>
            </label>
            <div id="injectionPromptContainer" style="margin-top: 12px; display: none;">
                <div class="mdl-textfield mdl-js-textfield" style="width: 100%; padding-top: 0;">
                    <textarea class="mdl-textfield__input" type="text" rows="3" id="injectionPromptInput" style="font-size: 12px; line-height: 1.4; background: rgba(0,0,0,0.03); border-radius: 4px; padding: 8px;"></textarea>
                    <label class="mdl-textfield__label" for="injectionPromptInput" style="padding-left: 8px;">Custom Injection Prompt...</label>
                </div>
            </div>
            <p style="font-size: 11px; color: #999; margin-top: 8px;">Note: This allows you to override or augment model behavior dynamically.</p>
        </div>    </div>
    <div class="mdl-dialog__actions">
        <button type="button" class="mdl-button" id="audioSettingsCancel">Cancel</button>
        <button type="button" class="mdl-button" id="audioSettingsSave">Save</button>
    </div>
</dialog>
`;
        placeholder.innerHTML = htmlContent;

        // Manually upgrade MDL components within the loaded HTML
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }

        // Initialize the audio settings dialog functionality after loading
        if (window.AudioProcessingControlsAgentic && window.AudioProcessingControlsAgentic.initializeAudioSettingsDialog) {
            window.AudioProcessingControlsAgentic.initializeAudioSettingsDialog();
        }

        // Initialize all the audio toggle handlers now that the HTML elements are available
        if (window.AudioProcessingControlsAgentic) {
            // Initialize auto audio play toggle
            if (typeof window.AudioProcessingControlsAgentic.initializeAutoAudioPlayToggle === 'function') {
                window.AudioProcessingControlsAgentic.initializeAutoAudioPlayToggle();
            } else {
                console.warn('initializeAutoAudioPlayToggle function not found');
            }

            // Initialize sequential audio play toggle
            if (typeof window.AudioProcessingControlsAgentic.initializeSequentialAudioPlayToggle === 'function') {
                window.AudioProcessingControlsAgentic.initializeSequentialAudioPlayToggle();
            } else {
                console.warn('initializeSequentialAudioPlayToggle function not found');
            }

            // Initialize interim audio toggle
            if (typeof window.AudioProcessingControlsAgentic.initializeInterimAudioToggle === 'function') {
                window.AudioProcessingControlsAgentic.initializeInterimAudioToggle();
            } else {
                console.warn('initializeInterimAudioToggle function not found');
            }

            // Initialize voice announcements toggle
            if (typeof window.AudioProcessingControlsAgentic.initializeVoiceAnnouncementsToggle === 'function') {
                window.AudioProcessingControlsAgentic.initializeVoiceAnnouncementsToggle();
            } else {
                console.warn('initializeVoiceAnnouncementsToggle function not found');
            }

            // Initialize voice selection
            if (typeof window.AudioProcessingControlsAgentic.initializeVoiceSelection === 'function') {
                window.AudioProcessingControlsAgentic.initializeVoiceSelection();
            } else {
                console.warn('initializeVoiceSelection function not found');
            }

            // Initialize transcription mode toggle
            if (typeof window.initializeTranscriptionModeToggle === 'function') {
                window.initializeTranscriptionModeToggle();
            } else {
                console.warn('initializeTranscriptionModeToggle function not found');
            }

            console.log('All audio processing toggle handlers initialized after dialog HTML loaded');
        }

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Audio Settings Dialog:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by pageInitializer.js
window.loadAudioSettingsDialog = loadAudioSettingsDialog; 