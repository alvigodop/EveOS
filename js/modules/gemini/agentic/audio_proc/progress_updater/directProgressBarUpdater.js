/**
 * Updates the progress bar and time display directly to a specific position.
 *
 * @param {HTMLElement} container - The audio player container, expected to have an audioDuration property.
 * @param {number} position - The playback position as a fraction (0 to 1).
 * @param {HTMLElement} progressBar - The progress bar element.
 * @param {HTMLElement} timeDisplay - The time display element.
 */
function updateProgressBar(container, position, progressBar, timeDisplay) {
    if (!progressBar || !timeDisplay || !container || typeof container.audioDuration === 'undefined') {
        // console.warn('updateProgressBar: Missing required elements or container.audioDuration');
        return;
    }

    try {
        const clampedPosition = Math.max(0, Math.min(1, position));
        // Update progress bar
        progressBar.style.width = `${clampedPosition * 100}%`;

        // Update time display
        const currentTime = clampedPosition * container.audioDuration;
        // formatTime is expected to be globally available from timeFormatter.js
        timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(container.audioDuration)}`;
    } catch (error) {
        console.error('Error updating progress bar:', error);
    }
} 