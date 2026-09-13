/**
 * audioPlayerUI.js
 * 
 * Handles the creation and management of the Audio Player UI within the chat interface.
 * Decoupled from socket logic.
 */

console.log("audioPlayerUI.js loading...");

(function () {

    // Append a base64 audio chunk to an accumulated base64 string SAFELY. Plain string concat is
    // only valid when the existing string has no '=' padding (i.e. its byte length is a multiple
    // of 3). A padded tail mid-string makes the whole clip undecodable (atob throws) — the replay
    // sounded corrupted/broken whenever Gemini emitted a chunk whose size wasn't a multiple of 3.
    // The rare padded case decodes both sides and re-encodes the joined bytes.
    function safeBase64Append(existing, chunk) {
        const a = String(existing || '');
        const b = String(chunk || '');
        if (!a) return b;
        if (!b) return a;
        if (!/=+$/.test(a)) return a + b;
        try {
            return btoa(atob(a) + atob(b));
        } catch (e) {
            console.warn('[audioPlayerUI] base64 re-join failed; keeping plain concat:', e);
            return a + b;
        }
    }

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
                targetMessage.classList.add('gemini-message');

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

        // Native output transcription can arrive after the first audio chunk. Keep the response
        // visibly pending instead of presenting a blank bubble and then popping text into it.
        const content = targetMessage.querySelector('.message-content');
        const hasTranscript = String(targetMessage.getAttribute('data-full-text') || content?.textContent || '').trim();
        if (!hasTranscript && !targetMessage.querySelector('.message-transcription-loading')) {
            const pending = document.createElement('div');
            pending.className = 'message-transcription-loading';
            pending.setAttribute('role', 'status');
            pending.setAttribute('aria-live', 'polite');
            pending.innerHTML = '<span class="message-transcription-loading__dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Transcription loading</span>';
            targetMessage.dataset.transcriptState = 'pending';
            targetMessage.insertBefore(pending, targetMessage.querySelector('.message-timestamp'));
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
                container.audioData = safeBase64Append(container.audioData, audioData);
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

            // The playback route schedules the live waveform when the user will hear this chunk.
            // Driving it here made the animation race ahead at backend-ingest speed.
        }
        return container;
    }

    // Export function to global scope
    window.ensureAudioPlayerUI = ensureAudioPlayerUI;

})();

console.log("audioPlayerUI.js loaded.");
