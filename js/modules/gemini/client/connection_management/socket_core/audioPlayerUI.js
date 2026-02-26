/**
 * audioPlayerUI.js
 * 
 * Handles the creation and management of the Audio Player UI within the chat interface.
 * Decoupled from socket logic.
 */

console.log("audioPlayerUI.js loading...");

(function () {

    // Helper function to ensure audio player UI exists and is updated
    function ensureAudioPlayerUI(audioData) {
        const chatLog = document.getElementById('chatLog');
        const containerDiv = chatLog ? (chatLog.querySelector('.chat-messages-container') || chatLog) : document.body;

        // Find the last message
        let targetMessage = containerDiv.querySelector('.chat-message:last-child');

        // If no message, or last was user, we need a new Gemini bubble for the audio
        const isUserMessage = targetMessage && (
            targetMessage.classList.contains('user-message') ||
            targetMessage.classList.contains('previous-user-message')
        );

        if (!targetMessage || isUserMessage) {
            console.log("[ensureAudioPlayerUI] New audio stream detected, creating new response bubble...");
            if (window.MessagingLog && window.MessagingLog.MessageUiCreator) {
                // Use the creator to make a standard bubble
                targetMessage = window.MessagingLog.MessageUiCreator.createMessageContainer("");

                // Create empty content div so we have a place for text later if it comes
                const content = window.MessagingLog.MessageUiCreator.createMessageContent("");
                targetMessage.appendChild(content);

                const time = window.MessagingLog.MessageUiCreator.createTimestamp();
                targetMessage.appendChild(time);

                window.MessagingLog.MessageUiCreator.appendMessageToLog(targetMessage);
            } else {
                // Fallback creation
                targetMessage = document.createElement('div');
                targetMessage.className = 'chat-message gemini-message message-container';

                const content = document.createElement('div');
                content.className = 'message-content';
                targetMessage.appendChild(content);

                containerDiv.appendChild(targetMessage);
            }
        }

        // Check for createAudioPlayer in global scope or MessagingLog namespace
        const createPlayerFn = (typeof createAudioPlayer === 'function') ? createAudioPlayer :
            (window.MessagingLog && window.MessagingLog.AudioPlayerComponentCreator && typeof window.MessagingLog.AudioPlayerComponentCreator.createAudioPlayer === 'function') ?
                window.MessagingLog.AudioPlayerComponentCreator.createAudioPlayer : null;

        if (!createPlayerFn) return null;

        let existingPlayer = targetMessage.querySelector('.audio-player-container');
        let container = null;

        if (!existingPlayer) {
            // Pass audioData to createAudioPlayer
            const created = createPlayerFn(audioData);

            if (created) {
                if (created.container && created.container instanceof HTMLElement) {
                    container = created.container;
                    // Append to WRAPPER, not content, to survive text updates
                    targetMessage.appendChild(container);

                    if (created.playButton) container.playButton = created.playButton;
                    if (created.progressBar) container.progressBar = created.progressBar;
                    if (created.timeDisplay) container.timeDisplay = created.timeDisplay;
                } else if (created instanceof HTMLElement) {
                    container = created;
                    targetMessage.appendChild(container);
                }

                // Ensure scrolled to bottom
                if (containerDiv.scrollTop) containerDiv.scrollTop = containerDiv.scrollHeight;
            }
        } else {
            container = existingPlayer;
            // APPEND: If container exists, accumulate the new chunk
            if (audioData) {
                container.audioData = (container.audioData || "") + audioData;
            }
        }

        if (container) {
            // container.audioData = audioData; // REMOVED to prevent overwriting accumulation

            // Attach event listener if not present
            const playButton = container.playButton || (container.querySelector && container.querySelector('button'));
            const progressBar = container.progressBar || (container.querySelector && container.querySelector('.audio-progress-bar'));
            const timeDisplay = container.timeDisplay || (container.querySelector && container.querySelector('.audio-time-display')); // Fixed class name selector

            // Real-time duration update
            if (audioData && timeDisplay && typeof window.TimePerceptionAgentic !== 'undefined') {
                // Estimate duration: 24kHz, 16-bit, 1 channel = 48000 bytes/sec
                // Base64 is ~1.333x larger than bytes. 
                // Approx bytes = base64.length * 0.75
                // Duration = (base64.length * 0.75) / 48000
                const estimatedSeconds = (container.audioData.length * 0.75) / 48000;

                // Only update total time, keep current time as 00:00.0 if not playing
                if (!container.isPlaying) {
                    const formattedDuration = window.TimePerceptionAgentic.formatTime(estimatedSeconds);
                    timeDisplay.textContent = `00:00.0 / ${formattedDuration}`;
                }
            }

            if (playButton && !playButton.hasEventListener) {
                playButton.hasEventListener = true;
                playButton.addEventListener('click', function () {
                    if (container.isPlaying && typeof stopAudioPlayback === 'function') {
                        stopAudioPlayback(container);
                    } else if (typeof playAudioFromBase64 === 'function') {
                        playAudioFromBase64(container, container.audioData, 'audio/pcm;rate=24000', playButton, progressBar, timeDisplay);
                    }
                });
            }
        }
        return container;
    }

    // Export function to global scope
    window.ensureAudioPlayerUI = ensureAudioPlayerUI;

})();

console.log("audioPlayerUI.js loaded.");
