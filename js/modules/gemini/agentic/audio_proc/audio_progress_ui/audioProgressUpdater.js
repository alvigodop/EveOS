/**
 * Helper function to start progress updates for an audio container.
 * It uses requestAnimationFrame for smoother UI updates.
 *
 * @param {HTMLElement} container - The audio player container element. Must have properties:
 *                                  isPlaying, audioSource, audioContext, playbackStartTime,
 *                                  playbackStartPosition, audioDuration, progressBar, timeDisplay,
 *                                  playButton, and animationFrame.
 */
function startProgressUpdates(container) {
    if (!container || !container.isPlaying) return;

    // Cancel any existing animation frame
    if (container.animationFrame) {
        cancelAnimationFrame(container.animationFrame);
        container.animationFrame = null;
    }

    const progressBar = container.progressBar;
    const timeDisplay = container.timeDisplay;
    const playButton = container.playButton;
    const duration = container.audioDuration;

    if (!progressBar || !timeDisplay || !duration) {
        console.error("Missing required elements for progress tracking");
        return;
    }

    console.log("Starting progress updates with requestAnimationFrame");

    // Use requestAnimationFrame for smoother progress updates
    function updateProgress() {
        if (!container.isPlaying || !container.audioSource) {
            console.log("Stopping progress tracking - audio not playing");
            return;
        }

        try {
            // Calculate elapsed time since playback started
            const elapsedTime = container.audioContext.currentTime - container.playbackStartTime;

            // Calculate current position (start position + elapsed time as a fraction of duration)
            const currentPosition = container.playbackStartPosition + (elapsedTime / duration);
            const clampedPosition = Math.min(currentPosition, 1);

            // Calculate current time in seconds
            const currentTime = clampedPosition * duration;

            // Update progress bar width
            progressBar.style.width = `${clampedPosition * 100}%`;

            // Update time display
            const durationFormatted = formatTime(duration); // formatTime should be globally available
            timeDisplay.textContent = `${formatTime(currentTime)} / ${durationFormatted}`;

            // Log progress occasionally
            if (Math.floor(currentTime) % 3 === 0 && Math.floor(currentTime * 10) % 10 === 0) {
                console.log(`Progress: ${(clampedPosition * 100).toFixed(1)}%, Time: ${currentTime.toFixed(2)}s`);
            }

            // If we've reached the end
            if (clampedPosition >= 1) {
                if (container._playbackCompleteHandled) return;
                container._playbackCompleteHandled = true;
                console.log("Playback complete");
                if (playButton && playButton.querySelector('i')) {
                    playButton.querySelector('i').textContent = 'play_arrow';
                }
                progressBar.style.width = '0%';
                timeDisplay.textContent = `00:00 / ${durationFormatted}`;
                container.audioSource = null;
                container.isPlaying = false;
                
                // Call onPlaybackComplete if defined, for queue management
                if (typeof container.onPlaybackComplete === 'function') {
                    container.onPlaybackComplete();
                }
                return;
            }

            // Continue updating
            container.animationFrame = requestAnimationFrame(updateProgress);
        } catch (error) {
            console.error('Error updating progress:', error);
        }
    }

    // Start progress updates
    container.animationFrame = requestAnimationFrame(updateProgress);
} 