/**
 * legacyAudioInitializer.js
 * Handles initialization of the fallback Web Audio API (Legacy Mode).
 */

window.AudioContextInitializer = window.AudioContextInitializer || {};

window.AudioContextInitializer.LegacyHelper = {

    // Initialize the Legacy Fallback
    initialize: async function (state, displayMessageFn) {
        console.log("LegacyHelper: Attempting to use fallback audio playback method...");

        try {
            // Create a new audio context if needed
            if (!state.audioInputContext) {
                state.audioInputContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 24000
                });
                window.audioInputContext = state.audioInputContext;
            }

            // Create a gain node for volume control
            const gainNode = state.audioInputContext.createGain();
            gainNode.gain.value = 1.0;
            gainNode.connect(state.audioInputContext.destination);

            // Store for later use
            state.audioInputContext.gainNode = gainNode;

            // Flag that we're using fallback
            state.audioInputContext.usingFallback = true;

            console.log("LegacyHelper: Fallback initialization successful");
            return true;

        } catch (fallbackError) {
            console.error("LegacyHelper: Fallback initialization failed:", fallbackError);

            if (typeof displayMessageFn === 'function') {
                displayMessageFn("System Message: Audio initialization failed completely. Audio features will be disabled.", true);
            }

            // Disable auto audio play as a safety measure
            if (window.AudioProcessingControlsAgentic) {
                // We might access helper functions here if needed, or just set global/local storage directly
                // mirroring original logic:
                window.autoAudioPlay = false;
                const autoAudioPlayToggle = document.getElementById('autoAudioPlayToggle');
                if (autoAudioPlayToggle) autoAudioPlayToggle.checked = false;
                localStorage.setItem('autoAudioPlay', 'false');
            }

            return false;
        }
    }
};
