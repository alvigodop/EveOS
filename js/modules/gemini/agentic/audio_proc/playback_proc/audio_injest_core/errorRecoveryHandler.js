/**
 * errorRecoveryHandler.js
 * Handles errors during ingestion and attempts to recover/reinitialize the audio context.
 */

window.AudioIngestCore = window.AudioIngestCore || {};

window.AudioIngestCore.ErrorRecoveryHandler = {
    handleIngestError: async function (error, base64AudioChunk) {
        console.error("Audio Ingest Error:", error);
        displayMessage("System Message: Error playing audio response - " + error.message, true);

        // Try to reinitialize audio context if there was an error
        try {
            console.log("Attempting to reinitialize audio context");
            displayMessage("System Message: Attempting to reinitialize audio...", true);

            // Stop all audio first
            if (typeof stopAllAudioPlayback === 'function') {
                stopAllAudioPlayback();
            }

            // Reinitialize audio context
            if (typeof initializeAudioContext === 'function') {
                const success = await initializeAudioContext();

                if (success && window.audioInputContext) {
                    // Try processing the audio again
                    const arrayBuffer = base64ToArrayBuffer(base64AudioChunk);
                    const WorkletHandler = window.AudioIngestCore.WorkletIngestHandler;

                    if (window.audioInputContext.usingWorklet && window.workletNode && WorkletHandler) {
                        // Using AudioWorklet
                        await WorkletHandler.playViaWorklet(arrayBuffer, window.audioInputContext);
                    } else if (window.audioInputContext.usingFallback && typeof playAudioWithFallbackMethod === 'function') {
                        // Using fallback
                        playAudioWithFallbackMethod(arrayBuffer);
                    }

                    console.log("Audio reinitialized and data resent");
                    displayMessage("System Message: Audio reinitialized successfully", true);
                } else {
                    this.disableAutoPlay();
                }
            } else {
                this.disableAutoPlay();
            }
        } catch (reinitError) {
            console.error("Failed to reinitialize audio:", reinitError);
            displayMessage("System Message: Failed to reinitialize audio - " + reinitError.message, true);
            this.disableAutoPlay();
        }
    },

    disableAutoPlay: function () {
        displayMessage("System Message: Auto audio play disabled", true);
        if (typeof autoAudioPlay !== 'undefined') {
            // We can't easily assign to the global variable if it's let/const in another scope without it being window attached,
            // assuming autoAudioPlay is global or window property.
            // Based on legacy code: autoAudioPlay = false;
            window.autoAudioPlay = false;
        }

        const toggle = document.getElementById('autoAudioPlayToggle');
        if (toggle) toggle.checked = false;

        localStorage.setItem('autoAudioPlay', 'false');
    }
};

console.log("errorRecoveryHandler.js loaded.");
