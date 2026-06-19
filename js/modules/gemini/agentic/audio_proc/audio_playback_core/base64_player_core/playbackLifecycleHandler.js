/**
 * playbackLifecycleHandler.js
 * Manages playback lifecycle events such as onended and onerror.
 */

window.Base64PlayerCore = window.Base64PlayerCore || {};

window.Base64PlayerCore.LifecycleHandler = {
    setupLifecycleEvents: function (source, container, playButton, progressBar, timeDisplay, durationFormatted) {
        const StateManagement = window.Base64PlayerCore.StateManagement;

        source.onended = function () {
            if (container._playbackCompleteHandled) return;
            container._playbackCompleteHandled = true;
            console.log("Audio playback ended naturally");
            StateManagement.cleanupState(container, playButton);

            // Reset UI
            if (progressBar) progressBar.style.width = '0%';
            if (timeDisplay) timeDisplay.textContent = `00:00 / ${durationFormatted}`;

            if (typeof container.onPlaybackComplete === 'function') {
                // Call the queue completion handler attached by the queue processor.
                // The queue completion handler is responsible for triggering the next item
                // in the sequential queue. Avoid calling the generic check here to prevent
                // duplicate triggers that can cause overlapping playback.
                container.onPlaybackComplete();
            }
        };

        source.onerror = function (e) {
            console.error('Audio source error:', e);
            StateManagement.cleanupState(container, playButton);
        };
    },

    checkSequentialPlayback: function () {
        if (typeof sequentialAudioPlay !== 'undefined' && sequentialAudioPlay &&
            typeof audioQueue !== 'undefined' && audioQueue.length > 0) {
            setTimeout(() => {
                if (typeof playNextInQueue === 'function') {
                    playNextInQueue();
                }
            }, 500);
        }
    }
};

console.log("playbackLifecycleHandler.js loaded.");
