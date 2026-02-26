/**
 * queueCompletionHandler.js
 * Handles audio playback completion events and triggers the next item in the queue.
 */

window.AudioQueueCore = window.AudioQueueCore || {};

window.AudioQueueCore.createCompletionHandler = function (audioItem, audioType, useImmediatePlay, playNextCallback) {
    const originalOnComplete = audioItem.container ? audioItem.container.onPlaybackComplete : null;

    return function () {
        console.log(`Sequential ${audioType} audio item completed`);

        // *** COMPREHENSIVE STATE CLEANUP ***
        try {
            // Call original complete function if it exists
            if (originalOnComplete && typeof originalOnComplete === 'function') {
                originalOnComplete();
            }

            // Reset UI
            window.AudioQueueCore.resetUIAfterPlayback(audioItem);

            // *** ENHANCED QUEUE STATE MANAGEMENT ***
            // Mark that we're no longer playing from queue (unless this was immediate play)
            if (!useImmediatePlay) {
                window.isPlayingFromQueue = false;
            }

            // *** SMART DELAY SYSTEM FOR OPTIMAL USER EXPERIENCE ***
            // Ultra-fast delays for interim chunks to maintain real-time feel
            // Slightly longer delays for complete audio to avoid overwhelming user
            const nextDelay = audioItem.isInterim ? 50 : 200; // 50ms for interim, 200ms for complete

            setTimeout(() => {
                if (window.audioQueue.length > 0) {
                    console.log(`Playing next sequential audio item after ${nextDelay}ms delay`);
                    playNextCallback();
                } else {
                    console.log("Sequential audio queue completed - all items processed");
                    window.isPlayingFromQueue = false; // Ensure flag is reset when queue is empty
                }
            }, nextDelay);

        } catch (error) {
            console.error("Error in audio completion callback:", error);
            // Ensure state is reset even on error
            window.isPlayingFromQueue = false;
        }
    };
};

console.log("queueCompletionHandler.js loaded.");
