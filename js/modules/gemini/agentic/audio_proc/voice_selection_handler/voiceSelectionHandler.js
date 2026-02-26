// Ensure the namespace exists
window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

/**
 * Initializes the voice selection functionality
 */
function initializeVoiceSelection() {
    const voiceSelect = document.getElementById('voiceSelect');
    const audioSettingsSaveButton = document.getElementById('audioSettingsSave');

    // Function to restore voice selection from localStorage
    function restoreVoiceSelection() {
        if (!voiceSelect) {
            console.warn('Voice select element not found for restoring voice selection.');
            return;
        }
        let savedVoice = localStorage.getItem('selectedVoice');
        
        // If no voice is saved, default to Aoede and save it
        if (!savedVoice) {
            savedVoice = 'Aoede';
            localStorage.setItem('selectedVoice', savedVoice);
            console.log('No saved voice found, defaulting to Aoede and saving to localStorage');
        }
        
        // Check if this voice exists in the options
        let voiceFound = false;
        for (let i = 0; i < voiceSelect.options.length; i++) {
            if (voiceSelect.options[i].value === savedVoice) {
                voiceSelect.selectedIndex = i;
                voiceFound = true;
                console.log(`Restored voice selection: ${savedVoice}`);
                break;
            }
        }
        
        // If saved voice doesn't exist in options, default to first option and save it
        if (!voiceFound && voiceSelect.options.length > 0) {
            voiceSelect.selectedIndex = 0;
            const defaultVoice = voiceSelect.options[0].value;
            localStorage.setItem('selectedVoice', defaultVoice);
            console.log(`Saved voice ${savedVoice} not found in options, defaulting to ${defaultVoice}`);
        }
    }

    // Function to save selected voice and reinitialize model
    function saveVoiceAndReinitialize() {
        if (!voiceSelect) {
            console.warn('Voice select element not found for saving voice.');
            return;
        }
        const selectedVoice = voiceSelect.value;
        localStorage.setItem('selectedVoice', selectedVoice);
        console.log(`Voice changed to: ${selectedVoice}`);
        
        if (typeof displayMessage === 'function') {
            displayMessage("System Message: Changing voice to " + selectedVoice);
        } else {
            console.warn('displayMessage function not found in voiceSelectionHandler.');
        }

        if (typeof resetConnection === 'function' && typeof connect === 'function') {
            resetConnection();
            setTimeout(() => connect(), 1000);
        } else {
            console.warn('resetConnection or connect function not found in voiceSelectionHandler.');
        }
    }

    // Restore voice selection on initialization
    restoreVoiceSelection();

    // Add event listener to the audio settings save button to handle voice change
    if (audioSettingsSaveButton) {
        audioSettingsSaveButton.addEventListener('click', () => {
            // This function will be called when the "Save" button in audio settings is clicked.
            // It's responsible for handling the voice selection part of the save operation.
            saveVoiceAndReinitialize();
        });
        console.log('Voice selection handler initialized successfully');
    } else {
        console.warn('Audio settings save button not found for voice selection handler.');
    }
}

// Expose the initialization function via the namespace
window.AudioProcessingControlsAgentic.initializeVoiceSelection = initializeVoiceSelection; 