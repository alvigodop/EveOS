/**
 * html5AudioFallback.js
 * Handles HTML5 Audio element fallback playback as a last resort.
 */

window.FallbackAudioCore = window.FallbackAudioCore || {};

window.FallbackAudioCore.playAudioWithHTML5Fallback = function (arrayBuffer, container = null) {
    try {
        console.log("Using HTML5 Audio element as fallback");

        // Convert PCM data to WAV format for HTML5 Audio
        // Ensure createWAVFromPCM is available
        if (typeof window.FallbackAudioCore.createWAVFromPCM !== 'function') {
            throw new Error("createWAVFromPCM utility not found");
        }

        const wavBuffer = window.FallbackAudioCore.createWAVFromPCM(arrayBuffer);

        // Convert ArrayBuffer to Blob
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(blob);

        // Create HTML5 Audio element
        const audio = new Audio(audioUrl);
        audio.volume = 1.0;

        // Set up event handlers
        audio.onended = function () {
            console.log("HTML5 Audio fallback playback ended");
            URL.revokeObjectURL(audioUrl);

            if (container) {
                container.isPlaying = false;
                container.audioSource = null;

                // Update UI elements if they exist
                if (container.playButton) {
                    const icon = container.playButton.querySelector('i');
                    if (icon) icon.textContent = 'play_arrow';
                }

                // Reset progress bar
                if (container.progressBar) {
                    container.progressBar.style.width = '0%';
                }

                // Call completion callback if defined
                if (typeof container.onPlaybackComplete === 'function') {
                    container.onPlaybackComplete();
                }
            }
        };

        audio.onerror = function (e) {
            console.error("HTML5 Audio fallback error:", e);
            URL.revokeObjectURL(audioUrl);

            if (container) {
                container.isPlaying = false;
                container.audioSource = null;
            }
        };

        // Start playback
        audio.play().then(() => {
            console.log("HTML5 Audio fallback playback started");

            if (container) {
                container.isPlaying = true;
                container.audioSource = audio;
            }
        }).catch(e => {
            console.error("Failed to start HTML5 Audio fallback:", e);
            URL.revokeObjectURL(audioUrl);
            throw e;
        });

        return audio;

    } catch (error) {
        console.error("HTML5 Audio fallback failed:", error);
        throw error;
    }
};

console.log("html5AudioFallback.js loaded.");
