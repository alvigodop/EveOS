/**
 * queueItemSelector.js
 * Logic for selecting the next audio item from the queue with priority handling.
 */

window.AudioQueueCore = window.AudioQueueCore || {};

window.AudioQueueCore.selectNextItem = function (queue, isPlaying) {
    let audioItem = null;
    let itemIndex = -1;
    let useImmediatePlay = false;

    // *** INTELLIGENT INTERIM AUDIO PROCESSING ***
    // Prioritize interim audio chunks when interim playback is enabled
    if (typeof window.playInterimAudio !== 'undefined' && window.playInterimAudio) {
        for (let i = 0; i < queue.length; i++) {
            if (queue[i].isInterim) {
                audioItem = queue.splice(i, 1)[0]; // Remove from queue immediately
                itemIndex = i;

                // *** ADVANCED IMMEDIATE PLAYBACK LOGIC ***
                // Determine if interim audio should play immediately or wait in queue
                if (!isPlaying) {
                    // Nothing currently playing - immediate playback for ultra-fast responsiveness
                    useImmediatePlay = true;
                    console.log(`Playing interim audio immediately (was position ${i} in queue) - real-time mode`);
                } else {
                    // Something is playing - add to front of queue for next immediate play
                    console.log(`Interim audio will play next with priority (was position ${i} in queue)`);
                }
                break;
            }
        }
    }

    // If no interim audio found or interim is disabled, take the first item
    if (!audioItem) {
        audioItem = queue.shift(); // Get the first item in the queue
        itemIndex = 0;
    }

    return { audioItem, useImmediatePlay };
};

console.log("queueItemSelector.js loaded.");
