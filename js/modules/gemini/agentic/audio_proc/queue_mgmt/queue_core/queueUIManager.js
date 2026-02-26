/**
 * queueUIManager.js
 * Manages UI updates for audio queue items.
 */

window.AudioQueueCore = window.AudioQueueCore || {};

window.AudioQueueCore.updateUIForPlayback = function (audioItem, audioType) {
    if (audioItem.playButton) {
        const playIcon = audioItem.playButton.querySelector('i');
        if (playIcon) {
            playIcon.textContent = 'pause';
        }
    }
    if (audioItem.container) {
        audioItem.container.isPlaying = true;

        // Add visual indicator for audio type
        const existingIndicator = audioItem.container.querySelector('.audio-type-indicator');
        if (!existingIndicator) {
            const indicator = document.createElement('span');
            indicator.className = 'audio-type-indicator';
            indicator.textContent = audioType === 'interim' ? '⚡' : '🔊';
            indicator.title = audioType === 'interim' ? 'Streaming audio chunk' : 'Complete audio response';
            indicator.style.cssText = 'font-size: 12px; margin-left: 5px; opacity: 0.7;';
            audioItem.container.appendChild(indicator);
        }
    }
};

window.AudioQueueCore.resetUIAfterPlayback = function (audioItem) {
    // Reset button state
    if (audioItem.playButton) {
        const playIcon = audioItem.playButton.querySelector('i');
        if (playIcon) {
            playIcon.textContent = 'play_arrow';
        }
    }

    // Reset container state
    if (audioItem.container) {
        audioItem.container.isPlaying = false;

        // Remove type indicator after playback
        const indicator = audioItem.container.querySelector('.audio-type-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
};

console.log("queueUIManager.js loaded.");
