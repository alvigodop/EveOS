/**
 * queuePlaybackExecutor.js
 * Executes audio playback using global player functions.
 */

window.AudioQueueCore = window.AudioQueueCore || {};

window.AudioQueueCore.executePlayback = function (audioItem, useImmediatePlay, isInterim) {
    // *** INTELLIGENT PLAYBACK ROUTING ***
    if (useImmediatePlay && isInterim) {
        console.log("Using immediate playback context for interim audio - preserving queue state");

        // Create a separate immediate playback context that doesn't interfere with sequential queue
        if (typeof window.playAudioFromBase64 === 'function') {
            try {
                window.playAudioFromBase64(
                    audioItem.container,
                    audioItem.audioData,
                    audioItem.format,
                    audioItem.playButton,
                    audioItem.progressBar,
                    audioItem.timeDisplay
                );
                console.log("Immediate interim audio playback initiated successfully");
            } catch (immediateError) {
                console.error("Error in immediate interim audio playback:", immediateError);
                // Reset UI state on immediate playback error
                if (audioItem.container) {
                    audioItem.container.isPlaying = false;
                }
            }
        } else {
            console.error("playAudioFromBase64 function not available for immediate playback");
        }
    } else {
        // *** STANDARD SEQUENTIAL PLAYBACK ***
        console.log("Using standard sequential playback");

        if (typeof window.playAudioFromBase64 === 'function') {
            window.playAudioFromBase64(
                audioItem.container,
                audioItem.audioData,
                audioItem.format,
                audioItem.playButton,
                audioItem.progressBar,
                audioItem.timeDisplay
            );
        } else {
            throw new Error("playAudioFromBase64 function not available");
        }
    }
};

// Helper: create a minimal temporary audio container so playback functions have a valid DOM anchor
window.AudioQueueCore.createTempContainer = function () {
    const container = document.createElement('div');
    container.className = 'audio-player-container temp-audio-container';
    container.style.display = 'none';

    // minimal refs to satisfy players
    const playButton = document.createElement('button');
    playButton.className = 'mdl-button mdl-js-button mdl-button--icon';
    playButton.innerHTML = '<i class="material-icons">play_arrow</i>';
    container.appendChild(playButton);

    document.body.appendChild(container);

    // attach refs for callers
    container.playButton = playButton;
    container.querySelector = container.querySelector.bind(container);

    return container;
};

console.log("queuePlaybackExecutor.js loaded.");
