// Module for handling audio auto-play logic
window.MessagingLog = window.MessagingLog || {};
window.MessagingLog.AudioAutoPlayHandler = {
    handleAutoPlay: function (components, audioData, processedAudioEnabled, autoPlayEnabled) {
        const { container, playButton, progressBar, timeDisplay } = components;

        if (processedAudioEnabled && autoPlayEnabled) {
            // Enhanced auto-play with better user gesture handling
            const tryAutoPlay = async () => {
                // Check if we have user gesture permission for audio
                const hasPermission = localStorage.getItem('audioContextUnlocked') === 'true' || window.audioContextUnlocked;

                if (!hasPermission) {
                    console.log("Auto-play blocked - no user gesture detected yet. Audio will play after first user interaction.");

                    // Set up one-time listener for user interaction
                    const enableAutoPlay = async () => {
                        console.log("User interaction detected - enabling auto-play for this message");
                        window.audioContextUnlocked = true;
                        localStorage.setItem('audioContextUnlocked', 'true');

                        // Now try auto-play
                        await tryAutoPlay();

                        document.removeEventListener('click', enableAutoPlay);
                        document.removeEventListener('keydown', enableAutoPlay);
                    };

                    document.addEventListener('click', enableAutoPlay, { once: true, passive: true });
                    document.addEventListener('keydown', enableAutoPlay, { once: true, passive: true });
                    return;
                }

                if (window.sequentialAudioPlay) {
                    // Add to queue for sequential playback
                    console.log("Adding audio to sequential playback queue");
                    if (window.audioQueue) {
                        window.audioQueue.push({
                            container: container,
                            audioData: audioData,
                            format: 'audio/pcm',
                            playButton: playButton,
                            progressBar: progressBar,
                            timeDisplay: timeDisplay
                        });

                        // Start playing from queue if we're not already
                        if (!window.isPlayingFromQueue && typeof window.playNextInQueue === 'function') {
                            console.log("Starting sequential audio playback");
                            window.playNextInQueue();
                        }
                    } else {
                        console.error("audioQueue not found!");
                    }
                } else {
                    // Standard auto-play (immediately play newest)
                    console.log("Starting immediate auto-play");

                    // Ensure audio context is ready before playing
                    if (typeof window.AudioProcessingControlsAgentic !== 'undefined' &&
                        typeof window.AudioProcessingControlsAgentic.ensureAudioContextReady === 'function') {
                        const audioReady = await window.AudioProcessingControlsAgentic.ensureAudioContextReady();
                        if (!audioReady) {
                            console.warn("Audio context not ready for auto-play");
                            return;
                        }
                    }

                    // Add a small delay to avoid browser autoplay restrictions
                    setTimeout(() => {
                        try {
                            // Simulate play button click to start audio
                            playButton.querySelector('i').textContent = 'pause';
                            container.isPlaying = true;
                            if (typeof window.playAudioFromBase64 === 'function') {
                                window.playAudioFromBase64(container, audioData, 'audio/pcm', playButton, progressBar, timeDisplay);
                                console.log("Auto-play started successfully");
                            } else {
                                console.error("playAudioFromBase64 not found!");
                            }
                        } catch (error) {
                            console.error("Auto-play failed:", error);
                            // Reset UI on failure
                            playButton.querySelector('i').textContent = 'play_arrow';
                            container.isPlaying = false;
                        }
                    }, 150); // Slightly longer delay for better reliability
                }
            };

            // Execute auto-play logic
            tryAutoPlay();
        }
    }
};
