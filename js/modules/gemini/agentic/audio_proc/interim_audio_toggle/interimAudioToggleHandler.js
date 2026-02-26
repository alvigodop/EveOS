// js/modules/gemini/interim_audio_toggle/interimAudioToggleHandler.js

// Global variable for interim audio playback state
let playInterimAudio = true;  // *** ENHANCED DEFAULT: Enable interim audio by default for better UX ***

// Ensure the namespace exists
window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

/**
 * Initializes the interim audio toggle functionality with enhanced user experience
 */
function initializeInterimAudioToggle() {
    const playInterimAudioToggle = document.getElementById('playInterimAudioToggle');

    if (playInterimAudioToggle) {
        // *** ENHANCED INITIALIZATION LOGIC ***
        // Initialize interim audio play toggle from localStorage with smart defaults
        const savedPlayInterimAudio = localStorage.getItem('playInterimAudio');
        if (savedPlayInterimAudio !== null) {
            playInterimAudio = savedPlayInterimAudio === 'true';
            playInterimAudioToggle.checked = playInterimAudio;
            console.log(`Interim audio restored from localStorage: ${playInterimAudio ? 'enabled' : 'disabled'}`);
        } else {
            // *** ENHANCED DEFAULT BEHAVIOR ***
            // Enable interim audio by default for optimal user experience
            playInterimAudio = true;
            playInterimAudioToggle.checked = playInterimAudio;
            localStorage.setItem('playInterimAudio', 'true');
            console.log("Interim audio enabled by default - optimized for real-time responsiveness");
            
            // Show helpful message on first use
            if (typeof displayMessage === 'function') {
                displayMessage("System Message: Interim audio enabled by default - you'll hear AI responses as they stream in real-time", true);
            }
        }

        // *** ENHANCED EVENT LISTENER WITH INTELLIGENT MESSAGING ***
        playInterimAudioToggle.addEventListener('change', function() {
            playInterimAudio = this.checked;
            
            if (typeof displayMessage === 'function') {
                if (playInterimAudio) {
                    // *** SMART MESSAGING BASED ON OTHER SETTINGS ***
                    const sequentialEnabled = (typeof sequentialAudioPlay !== 'undefined' && sequentialAudioPlay);
                    const autoPlayEnabled = (typeof playProcessedAudio !== 'undefined' && playProcessedAudio);
                    
                    if (sequentialEnabled && autoPlayEnabled) {
                        displayMessage("System Message: Interim audio chunks enabled - will be prioritized in sequential queue for immediate playback during streaming", true);
                    } else if (sequentialEnabled) {
                        displayMessage("System Message: Interim audio chunks enabled - will be added to sequential queue for ordered playback", true);
                    } else if (autoPlayEnabled) {
                        displayMessage("System Message: Interim audio chunks enabled - will play immediately as received for real-time feedback", true);
                    } else {
                        displayMessage("System Message: Interim audio chunks enabled - audio controls available in chat messages", true);
                    }
                } else {
                    displayMessage("System Message: Interim audio chunks disabled - only complete audio responses will be available for playback", true);
                }
            } else {
                console.warn('displayMessage function not found. Cannot display system message for interim audio toggle.');
            }
            
            // *** IMMEDIATE PERSISTENCE ***
            // Save the setting immediately for better user experience
            localStorage.setItem('playInterimAudio', playInterimAudio.toString());
            console.log(`Interim audio setting saved: ${playInterimAudio ? 'enabled' : 'disabled'}`);
        });

        console.log(`Interim audio toggle initialized successfully - current state: ${playInterimAudio ? 'enabled' : 'disabled'}`);
        
        // *** ENHANCED DEBUGGING AND VALIDATION ***
        // Validate that the toggle is working correctly
        setTimeout(() => {
            if (playInterimAudioToggle.checked !== playInterimAudio) {
                console.warn("Interim audio toggle state mismatch detected - correcting");
                playInterimAudioToggle.checked = playInterimAudio;
            }
        }, 100);
        
    } else {
        console.warn("Element with ID 'playInterimAudioToggle' not found. Interim audio toggle functionality may not work.");
        
        // *** FALLBACK HANDLING ***
        // Set default value even if toggle element isn't found
        const savedPlayInterimAudio = localStorage.getItem('playInterimAudio');
        if (savedPlayInterimAudio !== null) {
            playInterimAudio = savedPlayInterimAudio === 'true';
        } else {
            playInterimAudio = true; // Default to enabled
            localStorage.setItem('playInterimAudio', 'true');
        }
        console.log(`Interim audio fallback initialization: ${playInterimAudio ? 'enabled' : 'disabled'}`);
    }
}

// *** ENHANCED GLOBAL ACCESS FUNCTIONS ***
/**
 * Gets the current interim audio state
 * @returns {boolean} Current interim audio playback state
 */
function getInterimAudioState() {
    return playInterimAudio;
}

/**
 * Sets the interim audio state programmatically
 * @param {boolean} enabled - Whether interim audio should be enabled
 * @param {boolean} updateUI - Whether to update the UI toggle (default: true)
 */
function setInterimAudioState(enabled, updateUI = true) {
    playInterimAudio = !!enabled;
    localStorage.setItem('playInterimAudio', playInterimAudio.toString());
    
    if (updateUI) {
        const toggle = document.getElementById('playInterimAudioToggle');
        if (toggle) {
            toggle.checked = playInterimAudio;
        }
    }
    
    console.log(`Interim audio state set programmatically: ${playInterimAudio ? 'enabled' : 'disabled'}`);
    return playInterimAudio;
}

// Expose functions via the namespace
window.AudioProcessingControlsAgentic.initializeInterimAudioToggle = initializeInterimAudioToggle;
window.AudioProcessingControlsAgentic.getInterimAudioState = getInterimAudioState;
window.AudioProcessingControlsAgentic.setInterimAudioState = setInterimAudioState; 