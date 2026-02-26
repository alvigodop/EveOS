// js/modules/gemini/audio_processing_preferences_handler/audioProcessingPreferencesHandler.js

// Initialize global variables for audio processing settings
window.playProcessedAudio = true;
window.processedAudioDelay = 0;

window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

AudioProcessingControlsAgentic.initializeAudioProcessingPreferences = function() {
    // Restore Audio Processing preferences from localStorage
    const savedProcessed = localStorage.getItem('playProcessedAudio');
    if (savedProcessed !== null) {
        window.playProcessedAudio = savedProcessed === 'true';
        // The toggle's checked state will be handled by the master toggle logic below
    }

    const savedDelay = localStorage.getItem('processedAudioDelay');
    if (savedDelay !== null) {
        window.processedAudioDelay = parseInt(savedDelay, 10);
        const processedAudioDelayInput = document.getElementById('processedAudioDelayInput');
        if (processedAudioDelayInput) {
            processedAudioDelayInput.value = window.processedAudioDelay;
        }
    }

    // Master Audio Processing Controls toggle state and persistence
    const masterToggle = document.getElementById('playProcessedAudioToggle');
    const audioSettingsButton = document.getElementById('audioSettingsButton');

    if (masterToggle && audioSettingsButton) {
        // Set initial state of the toggle based on restored/default window.playProcessedAudio
        masterToggle.checked = window.playProcessedAudio;
        // Ensure MDL component is visually updated if applicable
        if (masterToggle.parentElement && typeof componentHandler !== 'undefined' && masterToggle.parentElement.classList.contains('is-upgraded')) {
            if (window.playProcessedAudio) {
                if (!masterToggle.parentElement.classList.contains('is-checked')) {
                    masterToggle.parentElement.classList.add('is-checked');
                }
            } else {
                if (masterToggle.parentElement.classList.contains('is-checked')) {
                    masterToggle.parentElement.classList.remove('is-checked');
                }
            }
        }

        // Enable or disable settings button accordingly
        audioSettingsButton.disabled = !window.playProcessedAudio;

        // Persist master toggle state when user toggles it
        masterToggle.addEventListener('change', () => {
            window.playProcessedAudio = masterToggle.checked;
            localStorage.setItem('playProcessedAudio', window.playProcessedAudio.toString());
            audioSettingsButton.disabled = !window.playProcessedAudio;
            if (typeof displayMessage === 'function') {
                 displayMessage(`System Message: Master Audio Playback ${window.playProcessedAudio ? 'enabled' : 'disabled'}`, true);
            }
        });
    } else {
        console.warn("Master audio toggle or audio settings button not found for audioProcessingPreferencesHandler.");
    }

    // The part for 'playInterimAudioToggle' restoration from original main.js
    // is intentionally omitted here as it should be fully handled by
    // js/modules/gemini/interim_audio_toggle/interimAudioToggleHandler.js
};

// The initialization will now be triggered externally by pageInitializer.js
// window.addEventListener('load', () => {
//     setTimeout(() => {
//         initializeAudioProcessingPreferences();
//     }, 100);
// }); 