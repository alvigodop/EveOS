// js/modules/gemini/sequential_audio_play_toggle/sequentialAudioPlayToggleHandler.js

// Ensure the namespace exists
window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

/**
 * Initializes the sequential audio play toggle functionality
 */
function initializeSequentialAudioPlayToggle() {
    // Assumes sequentialAudioPlay, audioQueue, isPlayingFromQueue are global (e.g., window.sequentialAudioPlay)
    // Assumes displayMessage is a global function

    const sequentialAudioPlayToggle = document.getElementById('sequentialAudioPlayToggle');

    if (sequentialAudioPlayToggle) {
        // Initialize sequential audio play toggle from localStorage or default
        // This runs on page load.
        // window.sequentialAudioPlay is initialized to false in main.js (or another early script)
        const savedSequentialAudioPlay = localStorage.getItem('sequentialAudioPlay');
        if (savedSequentialAudioPlay !== null) {
            window.sequentialAudioPlay = savedSequentialAudioPlay === 'true';
        } else {
            // If not in localStorage, sequentialAudioPlay retains its default (e.g., false from main.js)
            // and we store this default into localStorage.
            localStorage.setItem('sequentialAudioPlay', window.sequentialAudioPlay.toString());
        }
        sequentialAudioPlayToggle.checked = window.sequentialAudioPlay;


        // Ensure MDL visual state is correct after setting checked state
        if (sequentialAudioPlayToggle.parentElement && typeof componentHandler !== 'undefined') {
            if (sequentialAudioPlayToggle.parentElement.MaterialSwitch) {
                sequentialAudioPlayToggle.parentElement.MaterialSwitch.checkToggleState();
            } else if (sequentialAudioPlayToggle.parentElement.classList.contains('is-upgraded')) {
                 // Fallback for MDL state update if MaterialSwitch object isn't directly available
                if (window.sequentialAudioPlay) {
                    if (!sequentialAudioPlayToggle.parentElement.classList.contains('is-checked')) {
                        sequentialAudioPlayToggle.parentElement.classList.add('is-checked');
                    }
                } else {
                    if (sequentialAudioPlayToggle.parentElement.classList.contains('is-checked')) {
                        sequentialAudioPlayToggle.parentElement.classList.remove('is-checked');
                    }
                }
            }
        }

        // Add event listener for direct changes to the toggle (e.g., for immediate side effects)
        // Persistence via localStorage for this toggle is primarily handled by audioSettingsDialogHandler.js on dialog "Save",
        // but this handler also ensures localStorage is updated if changed directly.
        sequentialAudioPlayToggle.addEventListener('change', function() {
            window.sequentialAudioPlay = this.checked; // Update global variable
            localStorage.setItem('sequentialAudioPlay', window.sequentialAudioPlay.toString()); // Persist change

            if (typeof displayMessage === 'function') {
                displayMessage(`System Message: Sequential Audio Play ${window.sequentialAudioPlay ? 'enabled' : 'disabled'}`);
            }

            // Handle immediate side effects of toggling
            if (!window.sequentialAudioPlay) {
                if (typeof window.audioQueue !== 'undefined') {
                    window.audioQueue = [];
                }
                if (typeof window.isPlayingFromQueue !== 'undefined') {
                    window.isPlayingFromQueue = false;
                }
            }
        });

        console.log('Sequential audio play toggle initialized successfully');
    } else {
        console.warn("Element with ID 'sequentialAudioPlayToggle' not found. Sequential audio play toggle functionality may not work.");
    }
}

// Expose the initialization function via the namespace
window.AudioProcessingControlsAgentic.initializeSequentialAudioPlayToggle = initializeSequentialAudioPlayToggle; 