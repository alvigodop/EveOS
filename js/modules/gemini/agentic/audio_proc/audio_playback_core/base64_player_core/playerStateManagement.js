/**
 * playerStateManagement.js
 * Manages the state of the audio container during playback initialization and cleanup.
 */

window.Base64PlayerCore = window.Base64PlayerCore || {};

window.Base64PlayerCore.StateManagement = {
    initializeState: function (container) {
        const ContainerHelper = window.AudioContainerHelper;
        if (ContainerHelper && typeof ContainerHelper.initializeContainerState === 'function') {
            ContainerHelper.initializeContainerState(container);
        } else {
            console.warn("AudioContainerHelper.initializeContainerState not found");
        }
    },

    cleanupState: function (container, playButton) {
        const ContainerHelper = window.AudioContainerHelper;
        if (ContainerHelper && typeof ContainerHelper.cleanupContainerState === 'function') {
            ContainerHelper.cleanupContainerState(container, playButton);
        } else {
            console.warn("AudioContainerHelper.cleanupContainerState not found");
            // Basic fallback cleanup if helper is missing
            container.isPlaying = false;
            container.isStartingPlayback = false;
            if (playButton) {
                playButton.innerHTML = 'play_arrow'; // Fallback icon
            }
        }
    },

    markAsAudioContainer: function (container) {
        const ContainerHelper = window.AudioContainerHelper;
        if (ContainerHelper && typeof ContainerHelper.markAsAudioContainer === 'function') {
            ContainerHelper.markAsAudioContainer(container);
        }
    }
};

console.log("playerStateManagement.js loaded.");
