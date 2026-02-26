// Helper functions for audio container management state
window.AudioContainerHelper = window.AudioContainerHelper || {};

window.AudioContainerHelper.markAsAudioContainer = function (container) {
    if (container) {
        container.setAttribute('data-audio-container', 'true');
        console.log("Marked container as audio-enabled");
    }
};

window.AudioContainerHelper.initializeContainerState = function (container) {
    container.isStartingPlayback = true;
    container.playbackInitTime = Date.now();
    container.needsToStop = false;
};

window.AudioContainerHelper.cleanupContainerState = function (container, playButton) {
    container.isPlaying = false;
    container.isStartingPlayback = false;
    container.needsToStop = false;
    container.audioSource = null;

    if (playButton) {
        playButton.querySelector('i').textContent = 'play_arrow';
    }

    if (container.animationFrame) {
        cancelAnimationFrame(container.animationFrame);
        container.animationFrame = null;
    }
};
