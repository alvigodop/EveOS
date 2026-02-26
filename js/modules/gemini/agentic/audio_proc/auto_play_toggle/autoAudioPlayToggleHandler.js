// js/modules/gemini/auto_audio_play_toggle_handler/autoAudioPlayToggleHandler.js

// Ensure autoAudioPlay is globally accessible and initialized
window.autoAudioPlay = true; // Default value

// Ensure the namespace exists
window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

/**
 * Initializes the auto audio play toggle functionality
 */
function initializeAutoAudioPlayToggle() {
    const autoAudioPlayToggle = document.getElementById('autoAudioPlayToggle');

    if (autoAudioPlayToggle) {
        // Initialize from localStorage
        const savedAutoAudioPlay = localStorage.getItem('autoAudioPlay');
        if (savedAutoAudioPlay !== null) {
            window.autoAudioPlay = savedAutoAudioPlay === 'true';
        }
        // Set the default in localStorage if it's not there, based on initial window.autoAudioPlay
        // This ensures it's set before the main settings dialog might try to save it.
        else {
            localStorage.setItem('autoAudioPlay', window.autoAudioPlay.toString());
        }
        autoAudioPlayToggle.checked = window.autoAudioPlay;

        // Ensure MDL component is visually updated if applicable
        if (autoAudioPlayToggle.parentElement && typeof componentHandler !== 'undefined' && autoAudioPlayToggle.parentElement.classList.contains('is-upgraded')) {
             if (window.autoAudioPlay) {
                if (!autoAudioPlayToggle.parentElement.classList.contains('is-checked')) {
                    autoAudioPlayToggle.parentElement.classList.add('is-checked');
                }
            } else {
                if (autoAudioPlayToggle.parentElement.classList.contains('is-checked')) {
                    autoAudioPlayToggle.parentElement.classList.remove('is-checked');
                }
            }
            // If MDL's MaterialSwitch object is available and needs explicit update:
            // if (autoAudioPlayToggle.parentElement.MaterialSwitch) {
            //     autoAudioPlayToggle.parentElement.MaterialSwitch.checkToggleState();
            // }
        }

        // Add event listener for the toggle
        autoAudioPlayToggle.addEventListener('change', function() {
            window.autoAudioPlay = this.checked;
            if (typeof displayMessage === 'function') {
                 displayMessage(`System Message: Auto Audio Play ${window.autoAudioPlay ? 'enabled' : 'disabled'}`, true);
            }
            // Persistence to localStorage is handled by the 'audioSettingsSave' button in main.js.
            // The original listener in main.js for this toggle also did not persist directly.
        });

        console.log('Auto audio play toggle initialized successfully');
    } else {
        console.warn("Element with ID 'autoAudioPlayToggle' not found. Auto audio play feature may not initialize correctly.");
    }
}

// Expose the initialization function via the namespace
window.AudioProcessingControlsAgentic.initializeAutoAudioPlayToggle = initializeAutoAudioPlayToggle; 