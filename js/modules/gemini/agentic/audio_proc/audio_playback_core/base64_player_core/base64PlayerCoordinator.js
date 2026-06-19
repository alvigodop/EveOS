/**
 * base64PlayerCoordinator.js
 * Coordinator for playing audio from Base64 data.
 * Orchestrates State, Buffer, and Lifecycle modules.
 */

window.Base64PlayerCore = window.Base64PlayerCore || {};

window.Base64PlayerCore.Coordinator = {
    playAudioFromBase64: async function (container, base64Data, format, playButton, progressBar, timeDisplay) {
        console.log("Playing audio from base64 data (Modularized Coordinator)");

        const Core = window.Base64PlayerCore;
        const ContextInitializer = window.AudioContextInitializer;
        const SourceConfigurator = window.AudioSourceConfigurator;

        try {
            // 1. Initial Setup
            Core.StateManagement.markAsAudioContainer(container);

            if (!base64Data || base64Data.length === 0) {
                console.warn("No audio data provided, skipping playback");
                return;
            }

            Core.StateManagement.initializeState(container);

            // 2. Audio Context Initialization
            try {
                const context = await ContextInitializer.getOrInitializeContext(container);
                if (!context) throw new Error("Audio context check failed");
            } catch (contextError) {
                console.warn("Context initialization failed, attempting fallback:", contextError);
                return this.attemptFallback(base64Data, container, contextError);
            }

            // 3. Buffer Creation
            const arrayBuffer = Core.BufferHandler.base64ToArrayBuffer(base64Data);
            if (arrayBuffer.byteLength === 0) {
                console.warn("Audio buffer is empty, skipping playback");
                container.isStartingPlayback = false;
                return;
            }

            // Stop existing
            if (container.audioSource) {
                try { container.audioSource.stop(); } catch (e) { }
                container.audioSource = null;
            }

            // Check cancellation
            if (container.needsToStop) {
                console.log("Playback cancelled before buffer creation");
                Core.StateManagement.cleanupState(container, playButton);
                return;
            }

            let audioBuffer;
            try {
                audioBuffer = Core.BufferHandler.createAudioBuffer(arrayBuffer, container.audioContext);
            } catch (bufferError) {
                console.error("Error creating audio buffer:", bufferError);
                return this.attemptFallback(base64Data, container, bufferError);
            }

            // Check cancellation
            if (container.needsToStop) {
                console.log("Playback cancelled before source creation");
                Core.StateManagement.cleanupState(container, playButton);
                return;
            }

            // 4. Source Configuration
            const source = SourceConfigurator.setupSourceAndGain(container, audioBuffer);

            // Check cancellation
            if (container.needsToStop) {
                console.log("Playback cancelled before playback start");
                Core.StateManagement.cleanupState(container, playButton);
                return;
            }

            // Store References
            container.audioSource = source;
            container.audioBuffer = audioBuffer;
            container.isPlaying = true;
            container.audioDuration = audioBuffer.duration;
            container.playbackStartTime = container.audioContext.currentTime;
            container.playbackStartPosition = 0;

            // UI Setup
            const durationFormatted = typeof formatTime === 'function' ? formatTime(audioBuffer.duration) : "00:00";
            if (timeDisplay) timeDisplay.textContent = `00:00 / ${durationFormatted}`;

            if (container.animationFrame) {
                cancelAnimationFrame(container.animationFrame);
                container.animationFrame = null;
            }

            container.progressBar = progressBar;
            container.timeDisplay = timeDisplay;
            container.playButton = playButton;
            container._playbackCompleteHandled = false;

            // 5. Playback & Lifecycle
            try {
                // Resume Context if suspended
                if (container.audioContext.state === 'suspended') {
                    try {
                        await container.audioContext.resume();
                        window.audioContextUnlocked = true;
                        localStorage.setItem('audioContextUnlocked', 'true');
                    } catch (e) { console.warn("Final resume attempt failed:", e); }
                }

                Core.LifecycleHandler.setupLifecycleEvents(source, container, playButton, progressBar, timeDisplay, durationFormatted);

                // Diagnostics: log start time and container info
                try {
                    container._diagnostics = container._diagnostics || {};
                    container._diagnostics.startRequestedAt = Date.now();
                    console.log("[base64PlayerCoordinator] Starting audio playback", { container, duration: audioBuffer.duration });
                } catch (e) { console.log('[base64PlayerCoordinator] start log failed'); }

                source.start();
                console.log("Audio playback started successfully");

                // Attach diagnostics without replacing the lifecycle cleanup handler.
                const lifecycleOnEnded = source.onended;
                source.onended = function (event) {
                    try {
                        console.log('[base64PlayerCoordinator] source.onended fired for container', container);
                        if (!container._diagnostics) container._diagnostics = {};
                        container._diagnostics.endedAt = Date.now();
                    } catch (e) { console.log('[base64PlayerCoordinator] onended log failed'); }

                    if (typeof lifecycleOnEnded === 'function') {
                        lifecycleOnEnded.call(source, event);
                    }
                };

                if (typeof startProgressUpdates === 'function') {
                    startProgressUpdates(container);
                } else {
                    console.warn("startProgressUpdates global function not found");
                }

            } catch (startError) {
                console.error('Error starting audio playback:', startError);
                Core.StateManagement.cleanupState(container, playButton);
                return this.attemptFallback(base64Data, container, startError);
            }

            // Final Initialization Cleanup
            setTimeout(() => {
                const timeSinceInit = Date.now() - container.playbackInitTime;
                console.log(`Audio playback initialization completed in ${timeSinceInit}ms`);
                container.isStartingPlayback = false;

                if (container.needsToStop) {
                    if (typeof stopAudioPlayback === 'function') stopAudioPlayback(container);
                    container.needsToStop = false;
                }
            }, 100);

        } catch (error) {
            console.error('Error playing audio:', error);
            if (typeof displayMessage === 'function') {
                displayMessage(`System Message: Error playing audio - ${error.message}`, true);
            }
            Core.StateManagement.cleanupState(container, playButton);
            this.attemptFallback(base64Data, container, error);
        }
    },

    attemptFallback: function (base64Data, container, originalError) {
        const Core = window.Base64PlayerCore;
        if (typeof window.AudioProcessingControlsAgentic !== 'undefined' &&
            typeof window.AudioProcessingControlsAgentic.playAudioWithFallbackMethod === 'function') {
            console.log("Attempting fallback playback method...");
            try {
                const arrayBuffer = Core.BufferHandler.base64ToArrayBuffer(base64Data);
                return window.AudioProcessingControlsAgentic.playAudioWithFallbackMethod(arrayBuffer, container);
            } catch (e) {
                console.error("Fallback setup failed:", e);
            }
        } else {
            // If fallback not available and it came from an error, rethrow or just log
            if (originalError) throw originalError;
        }
    }
};

// Expose the main function globally to match the previous interface
window.playAudioFromBase64 = function (container, base64Data, format, playButton, progressBar, timeDisplay) {
    if (window.Base64PlayerCore && window.Base64PlayerCore.Coordinator) {
        return window.Base64PlayerCore.Coordinator.playAudioFromBase64(container, base64Data, format, playButton, progressBar, timeDisplay);
    } else {
        console.error("Base64PlayerCore.Coordinator not ready yet.");
    }
};

console.log("base64PlayerCoordinator.js loaded.");
