/**
 * queueProcessor.js
 * Main entry point for audio queue processing. Orchestrates the selection,
 * execution, and state management of queued audio items.
 */

// Ensure dependencies are ready
window.AudioQueueCore = window.AudioQueueCore || {};

// Function to play the next audio message in the queue with enhanced interim audio support
function playNextInQueue() {
    // Check if queue is empty
    if (!window.audioQueue || window.audioQueue.length === 0) {
        window.isPlayingFromQueue = false;
        console.log("Audio queue is empty, stopping sequential playback");
        return;
    }

    // 1. Select Item
    const selection = window.AudioQueueCore.selectNextItem(window.audioQueue, window.isPlayingFromQueue);
    const audioItem = selection.audioItem;
    const useImmediatePlay = selection.useImmediatePlay;

    const audioType = audioItem.isInterim ? 'interim' : 'complete';
    console.log(`Playing ${audioType} audio from queue, ${window.audioQueue.length} items remaining`);

    // 2. State Management
    // Mark that we're now playing from queue (unless using immediate play for interim)
    if (!useImmediatePlay) {
        // Check if we're already playing something
        if (window.isPlayingFromQueue) {
            console.log("Already playing from queue, queueing this item for immediate next play");
            // Put the item back at the front of the queue for immediate next play
            window.audioQueue.unshift(audioItem);
            return;
        }
        window.isPlayingFromQueue = true;
    } else {
        console.log("Using immediate playback mode - won't block sequential queue");
    }

    // 3. UI Updates
    window.AudioQueueCore.updateUIForPlayback(audioItem, audioType);

    // 4. Setup Completion Handler
    if (audioItem.container) {
        audioItem.container.onPlaybackComplete = window.AudioQueueCore.createCompletionHandler(
            audioItem,
            audioType,
            useImmediatePlay,
            playNextInQueue // Recursion for next item
        );
    }

    // 5. Execute Playback
    try {
        // Ensure container exists - create a temporary one if needed
        if (!audioItem.container) {
            console.warn('[queueProcessor] audioItem missing container, creating temporary container');
            if (window.AudioQueueCore && typeof window.AudioQueueCore.createTempContainer === 'function') {
                audioItem.container = window.AudioQueueCore.createTempContainer();
            } else {
                // Fallback: create a hidden div
                const tmp = document.createElement('div');
                tmp.className = 'audio-player-container temp-audio-container';
                tmp.style.display = 'none';
                document.body.appendChild(tmp);
                audioItem.container = tmp;
            }
        }

        window.AudioQueueCore.executePlayback(audioItem, useImmediatePlay, audioItem.isInterim);
    } catch (error) {
        console.error(`Error playing sequential ${audioType} audio:`, error);

        // *** COMPREHENSIVE ERROR STATE RECOVERY ***
        // Reset state on error to prevent queue from getting stuck
        if (!useImmediatePlay) {
            window.isPlayingFromQueue = false;
        }

        // Reset UI elements
        window.AudioQueueCore.resetUIAfterPlayback(audioItem);

        // *** INTELLIGENT ERROR RECOVERY ***
        // Try next item after error with exponential backoff
        const errorDelay = audioItem.isInterim ? 500 : 1000; // Shorter delay for interim chunks
        setTimeout(() => {
            if (window.audioQueue.length > 0) {
                console.log(`Attempting to play next item after ${errorDelay}ms error recovery delay`);
                playNextInQueue();
            } else {
                console.log("No more items in queue after error");
            }
        }, errorDelay);
    }
}

// Export globally
window.playNextInQueue = playNextInQueue;

console.log("queueProcessor.js loaded.");
