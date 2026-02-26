// Module for handling audio player events (click, seek, volume, speed)
window.MessagingLog = window.MessagingLog || {};
window.MessagingLog.AudioPlayerEventHandler = {
    attachEvents: function (components) {
        const { container, playButton, progressContainer, progressBar, timeDisplay, volumeSlider, speedSelector } = components;

        // Play button handler
        playButton.addEventListener('click', function () {
            if (!container.isPlaying) {
                // Stop any currently playing audio first
                const allContainers = document.querySelectorAll('.audio-player-container');
                allContainers.forEach(otherContainer => {
                    if (otherContainer !== container && otherContainer.isPlaying) {
                        if (otherContainer.audioSource) {
                            try {
                                otherContainer.audioSource.stop();
                            } catch (e) {
                                console.error('Error stopping audio:', e);
                            }
                            otherContainer.audioSource = null;
                            otherContainer.isPlaying = false;
                            const playBtn = otherContainer.querySelector('button');
                            if (playBtn) {
                                playBtn.querySelector('i').textContent = 'play_arrow';
                            }
                        }
                    }
                });

                // Now play this audio
                playButton.querySelector('i').textContent = 'pause';
                container.isPlaying = true;
                if (typeof window.playAudioFromBase64 === 'function') {
                    window.playAudioFromBase64(container, container.audioData, 'audio/pcm', playButton, progressBar, timeDisplay);
                } else {
                    console.error("playAudioFromBase64 function not found");
                }
            } else {
                // Pause playback
                playButton.querySelector('i').textContent = 'play_arrow';
                container.isPlaying = false;
                if (container.audioSource) {
                    try {
                        container.audioSource.stop();
                    } catch (e) {
                        console.error('Error stopping audio:', e);
                    }
                    container.audioSource = null;
                }
            }
        });

        // Handle progress bar clicks for seeking
        progressContainer.addEventListener('click', function (e) {
            if (!container.audioDuration) return;

            const rect = progressContainer.getBoundingClientRect();
            const position = (e.clientX - rect.left) / rect.width;

            // Only seek if we have valid data
            if (position >= 0 && position <= 1 && container.audioData) {
                if (typeof window.seekAudio === 'function') {
                    window.seekAudio(container, position, playButton, progressBar, timeDisplay);
                }
            }
        });

        // Handle volume changes
        volumeSlider.addEventListener('input', function () {
            container.volume = parseFloat(this.value);

            // Update the current playback if it's playing
            if (container.gainNode) {
                container.gainNode.gain.value = container.volume;
            }
        });

        // Handle playback speed changes
        speedSelector.addEventListener('change', function () {
            container.playbackRate = parseFloat(this.value);
            console.log(`Playback speed changed to ${container.playbackRate}x`);

            // If currently playing, restart with new speed
            if (container.isPlaying && container.audioSource) {
                // Get current position
                // Check if audioContext exists
                if (container.audioContext) {
                    const currentTime = container.audioContext.currentTime;
                    const startTime = container.playbackStartTime || 0;
                    const offset = container.playbackStartPosition || 0;
                    const elapsedTime = (currentTime - startTime) + offset;
                    const position = elapsedTime / container.audioDuration;

                    // Seek to current position with new speed
                    if (typeof window.seekAudio === 'function') {
                        window.seekAudio(container, position, playButton, progressBar, timeDisplay);
                    }
                }
            }
        });
    }
};
