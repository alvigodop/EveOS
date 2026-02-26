// js/modules/gemini/message_display_operations/incomingMessageHandler.js

function showIncomingMessage(text, isTranscription = false, audioData = null) {
    // Stop any currently playing audio first - but do it gracefully
    const allContainers = document.querySelectorAll('.audio-player-container');
    allContainers.forEach(container => {
        if (container.isPlaying) {
            // Avoid cancelling sequential queue playback: if this container is marked as audio container and
            // the system is currently playing from the queue, don't mark it for stop.
            const isAudioContainer = container.getAttribute && container.getAttribute('data-audio-container') === 'true';
            if (isAudioContainer && window.isPlayingFromQueue) {
                return; // leave playing queued audio alone
            }

            // Mark as needs stopping, but don't forcefully stop
            container.needsToStop = true;
            // Only call stop directly if we're not in the middle of starting playback
            if (!container.isStartingPlayback) {
                if (typeof stopAudioPlayback === 'function') {
                    stopAudioPlayback(container);
                }
            }
        }
    });

    // NEW: Process inline transcription tags if extraction mode is active
    let cleanedText = text;
    if (window.AudioProcessingControlsAgentic &&
        window.AudioProcessingControlsAgentic.TranscriptionModeState &&
        window.AudioProcessingControlsAgentic.TranscriptionModeState.isExtractionEnabled() &&
        window.AudioProcessingControlsAgentic.TranscriptionTagHandler) {

        const result = window.AudioProcessingControlsAgentic.TranscriptionTagHandler.processTranscriptionTags(text);
        cleanedText = result.cleanedText;
    }

    // STREAMING LOGIC: Check if we can append to the last message
    let appended = false;
    let targetMessage = null;

    const chatLog = document.getElementById('chatLog');
    const container = chatLog ? (chatLog.querySelector('.chat-messages-container') || chatLog) : null;
    const lastMessage = container ? container.lastElementChild : null;

    // Only append if:
    // 1. Last message exists and is from Gemini (has 'gemini-message' class)
    // 2. This new content is NOT a user message (doesn't start with "YOU: ")
    // 3. This is NOT a system message (usually "System:" or explicit flag, but we assume default is Gemini text)
    if (lastMessage && lastMessage.classList.contains('gemini-message') &&
        cleanedText && !cleanedText.startsWith("YOU: ") && !cleanedText.startsWith("System:")) {

        targetMessage = lastMessage;

        // Retrieve current full text
        let currentFullText = targetMessage.getAttribute('data-full-text') || "";

        // Append new text with separator to avoid merging with thinking blocks
        let newFullText = currentFullText + "\n\n" + cleanedText;
        targetMessage.setAttribute('data-full-text', newFullText);

        // Re-render content
        if (window.MessagingLog && window.MessagingLog.MessageUiCreator) {
            const newContent = window.MessagingLog.MessageUiCreator.createMessageContent(newFullText);

            // Replace old content div
            const oldContent = targetMessage.querySelector('.message-content');
            if (oldContent) {
                targetMessage.replaceChild(newContent, oldContent);
            } else {
                targetMessage.appendChild(newContent);
            }
        } else {
            // Fallback: strictly target the content div to avoid wiping siblings (like audio player)
            const contentDiv = targetMessage.querySelector('.message-content');
            if (contentDiv) {
                contentDiv.textContent = newFullText;
            } else {
                // If no content div exists, append one (rare recovery case)
                const newContentDiv = document.createElement('div');
                newContentDiv.className = 'message-content';
                newContentDiv.textContent = newFullText;
                // Prepend to ensure it appears before timestamps/audio if they exist
                targetMessage.prepend(newContentDiv);
            }
        }

        appended = true;
    }

    if (!appended) {
        // Create NEW message
        if (window.MessagingLog && window.MessagingLog.MessageUiCreator) {
            targetMessage = window.MessagingLog.MessageUiCreator.createMessageContainer(cleanedText);

            // Initialize data-full-text
            targetMessage.setAttribute('data-full-text', cleanedText || "");

            const messageContent = window.MessagingLog.MessageUiCreator.createMessageContent(cleanedText);
            const timestampElement = window.MessagingLog.MessageUiCreator.createTimestamp();

            targetMessage.appendChild(messageContent);
            targetMessage.appendChild(timestampElement);
        } else {
            // Fallback
            targetMessage = document.createElement('div');
            targetMessage.className = 'chat-message gemini-message';
            targetMessage.setAttribute('data-full-text', cleanedText || "");

            const messageContent = document.createElement("div");
            messageContent.className = "message-content";
            messageContent.textContent = cleanedText;
            const timestampElement = document.createElement("div");
            timestampElement.className = "message-timestamp";
            timestampElement.textContent = new Date().toLocaleTimeString();
            targetMessage.appendChild(messageContent);
            targetMessage.appendChild(timestampElement);
        }

        // Append to log immediately
        if (window.MessagingLog && window.MessagingLog.MessageUiCreator) {
            window.MessagingLog.MessageUiCreator.appendMessageToLog(targetMessage);
        } else {
            if (container) {
                container.appendChild(targetMessage);
                container.scrollTop = container.scrollHeight;
            }
        }
    }

    // If we have audio data, add an audio player component
    // We access globals: playProcessedAudio, autoAudioPlay
    const shouldPlayAudio = (typeof playProcessedAudio !== 'undefined') ? playProcessedAudio : false;

    if (audioData && shouldPlayAudio) {
        if (window.MessagingLog && window.MessagingLog.AudioPlayerComponentCreator) {
            const components = window.MessagingLog.AudioPlayerComponentCreator.createAudioPlayer(audioData);

            if (window.MessagingLog.AudioPlayerEventHandler) {
                window.MessagingLog.AudioPlayerEventHandler.attachEvents(components);
            }

            console.log("[incomingMessageHandler] Audio UI created and data attached.");

            // Add the audio player to the target message (whether new or appended)
            targetMessage.appendChild(components.container);

            // Scroll to bottom after adding audio player
            if (container) {
                container.scrollTop = container.scrollHeight;
            }

        } else {
            console.error("MessagingLog.AudioPlayerComponentCreator not found.");
        }
    }

    // We already appended the message if it was new.
    // If it was appended, we just updated the DOM in place.

    // Save to localStorage after adding a message
    if (typeof saveChatToLocalStorage === 'function') {
        saveChatToLocalStorage();
    }

    // Log when message processing is complete
    if (typeof displayMessage === 'function') {
        displayMessage("System Message: Processing complete", true);
    }

    // Check if we should initiate a self-talk after this message
    // We do this here to ensure self-talk is triggered after every message
    // Accessing globals: aiSelftalkEnabled, selftalkTimeout
    const isSelftalkEnabled = (typeof aiSelftalkEnabled !== 'undefined') ? aiSelftalkEnabled : false;
    const isSelftalkTimeout = (typeof selftalkTimeout !== 'undefined') ? selftalkTimeout : false;

    if (isSelftalkEnabled && !isSelftalkTimeout) {
        console.log("Message received, scheduling next self-talk");
        setTimeout(() => {
            // Re-check globals inside timeout
            const currentSelftalkEnabled = (typeof aiSelftalkEnabled !== 'undefined') ? aiSelftalkEnabled : false;
            const currentSelftalkTimeout = (typeof selftalkTimeout !== 'undefined') ? selftalkTimeout : null;

            if (currentSelftalkEnabled && !currentSelftalkTimeout) {
                console.log("Initiating scheduled self-talk after message");
                if (typeof initiateSelftalk === 'function') {
                    initiateSelftalk();
                }
            }
        }, 2000); // Wait a short time after message display before starting self-talk
    }
} 