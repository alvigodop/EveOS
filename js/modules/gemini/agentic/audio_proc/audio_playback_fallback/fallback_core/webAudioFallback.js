/**
 * webAudioFallback.js
 * Handles Web Audio API specific fallback logic.
 */

window.FallbackAudioCore = window.FallbackAudioCore || {};

window.FallbackAudioCore.playAudioWithWebAudio = function (arrayBuffer, container) {
    console.log("Using fallback audio playback method (Web Audio API)");

    // Use the global audioInputContext or create a new one
    let audioContext = window.audioInputContext;
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 24000
            });
            console.log("Created fallback audio context");
        } catch (contextError) {
            console.warn("Failed to create AudioContext for fallback, using HTML5 Audio:", contextError);
            return window.FallbackAudioCore.playAudioWithHTML5Fallback(arrayBuffer, container);
        }
    }

    // Check if context is suspended (likely due to lack of user gesture).
    // Prefer resuming the already-unlocked Web Audio path before falling back;
    // immediately switching to HTML5 Audio can drop queued Gemini replies.
    if (audioContext.state === 'suspended') {
        try {
            const resumePromise = audioContext.resume();
            if (resumePromise && typeof resumePromise.catch === 'function') {
                resumePromise.catch((e) => {
                    console.warn("Failed to resume fallback audio context:", e);
                });
            }
            console.log("Fallback audio context resume requested");
        } catch (e) {
            console.warn("Failed to resume fallback audio context:", e);
            return window.FallbackAudioCore.playAudioWithHTML5Fallback(arrayBuffer, container);
        }
        if (audioContext.state === 'suspended') {
            console.log("AudioContext remains suspended, trying HTML5 Audio fallback");
            return window.FallbackAudioCore.playAudioWithHTML5Fallback(arrayBuffer, container);
        }
    }

    // Create AudioBuffer from PCM data
    // Assuming createAudioBufferFromPCM is globally available (defined in audioBufferCreator.js)
    if (typeof window.createAudioBufferFromPCM !== 'function') {
        throw new Error("createAudioBufferFromPCM global function not found");
    }

    const audioBuffer = window.createAudioBufferFromPCM(arrayBuffer, audioContext);
    if (!audioBuffer) {
        throw new Error("Failed to create audio buffer from PCM data");
    }

    console.log(`Fallback audio buffer created with duration: ${audioBuffer.duration.toFixed(2)}s`);

    // Create a source node
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // Create or use existing gain node for volume control
    let gainNode = audioContext.gainNode;
    if (!gainNode) {
        gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0;
        gainNode.connect(audioContext.destination);
        audioContext.gainNode = gainNode;
    }

    // Connect source to gain node
    source.connect(gainNode);

    // Start playback
    source.start();
    console.log("Fallback audio playback started");

    // Store the source for potential stopping
    audioContext.currentSource = source;

    // If a container is provided, update its state
    if (container) {
        container.isPlaying = true;
        container.audioSource = source;
        container.audioBuffer = audioBuffer;
        container.audioContext = audioContext;
    }

    // When playback ends
    source.onended = function () {
        console.log("Fallback audio playback ended");
        audioContext.currentSource = null;

        if (container) {
            container.isPlaying = false;
            container.audioSource = null;

            // Call completion callback if defined
            if (typeof container.onPlaybackComplete === 'function') {
                container.onPlaybackComplete();
            }

            // Update UI elements if they exist
            if (container.playButton) {
                const icon = container.playButton.querySelector('i');
                if (icon) icon.textContent = 'play_arrow';
            }

            // Reset progress bar
            if (container.progressBar) {
                container.progressBar.style.width = '0%';
            }
        }

        // Check if sequential audio play is enabled and there are items in the queue
        if (typeof window.sequentialAudioPlay !== 'undefined' && window.sequentialAudioPlay &&
            typeof window.audioQueue !== 'undefined' && window.audioQueue.length > 0) {
            // Play the next item in the queue after a short delay
            setTimeout(() => {
                if (typeof window.playNextInQueue === 'function') {
                    window.playNextInQueue();
                }
            }, 500);
        }
    };

    // Handle errors
    source.onerror = function (e) {
        console.error("Fallback audio playback error:", e);
        audioContext.currentSource = null;

        if (container) {
            container.isPlaying = false;
            container.audioSource = null;
        }

        // Try HTML5 Audio as last resort
        console.log("Trying HTML5 Audio after Web Audio API error");
        return window.FallbackAudioCore.playAudioWithHTML5Fallback(arrayBuffer, container);
    };

    return source;
};

console.log("webAudioFallback.js loaded.");
