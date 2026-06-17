function normalizeImageAttachments(options) {
    const attachments = Array.isArray(options?.attachments) ? options.attachments : [];
    return attachments
        .filter((item) => item && item.data && item.mimeType && String(item.mimeType).startsWith('image/'))
        .map((item) => ({
            name: item.name || 'attached-image',
            mimeType: item.mimeType,
            data: item.data,
            bytes: item.bytes || Math.ceil((String(item.data).length * 3) / 4),
            source: item.source || 'chat'
        }));
}

function appendImageAttachmentChunks(mediaChunks, attachments) {
    attachments.forEach((item) => {
        mediaChunks.push({
            mime_type: item.mimeType,
            data: item.data,
            name: item.name,
            bytes: item.bytes,
            source: item.source
        });
    });
}

function buildAttachmentMeta(attachments) {
    return attachments.map((item) => ({
        name: item.name,
        mime_type: item.mimeType,
        bytes: item.bytes,
        source: item.source
    }));
}

function sendTextMessage(text, isSystemMessage = false, options = {}) {
    const messageText = String(text || '');
    const imageAttachments = normalizeImageAttachments(options);

    if (!isSystemMessage && !messageText.startsWith("[SYSTEM:")) {
        // Regular user message, reset consecutive self-talks counter
        consecutiveSelfTalks = 0;
    }

    let payload;

    // If screen sharing is active, capture and send frame WITH the text in the same payload
    if (isScreenShared && !isSystemMessage && !messageText.startsWith("[SYSTEM:")) {
        console.log("Screen sharing active, sending frame WITH text");
        const imageData = typeof window.captureScreenFrame === 'function'
            ? window.captureScreenFrame()
            : captureImage();
        const Prefs = window.ScreenShareMMCommunicationPanel?.CapturePreferences;
        const prefs = Prefs?.get ? Prefs.get() : null;
        const Processor = window.ScreenShareMMCommunicationPanel?.FrameProcessor;
        const frame = Processor?.normalizeFrame ? Processor.normalizeFrame(imageData, prefs) : (
            typeof imageData === 'string' ? { data: imageData, mimeType: 'image/jpeg' } : imageData
        );

        // Add explicit role indication to the text
        const attachmentNote = imageAttachments.length
            ? ` The user also attached ${imageAttachments.length} image${imageAttachments.length === 1 ? '' : 's'} in chat.`
            : '';
        const textWithRole = `[USER asks while sharing screen]: ${messageText}${attachmentNote}`;

        // Append time perception if enabled
        let finalText = textWithRole;
        const timePerceptionEnabled = window.TimePerceptionAgentic?.isTimePerceptionEnabled?.() || false;
        if (timePerceptionEnabled) {
            const now = new Date();
            const timeOptions = { hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short' };
            const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            finalText += "\n[SYSTEM: The current time is " + now.toLocaleTimeString([], timeOptions) + " on " + now.toLocaleDateString([], dateOptions) + "]";
        }

        // NEW: Persistent Transcription Reminder
        if (window.AudioProcessingControlsAgentic &&
            window.AudioProcessingControlsAgentic.TranscriptionModeState &&
            window.AudioProcessingControlsAgentic.TranscriptionModeState.isInlineTranscriptionEnabled()) {
            finalText += "\n[SYSTEM: Start your response with <Transcribe-Start> tags NOW!]";
        }

        payload = {
            source: "screen_share_user_message",
            screen_share: {
                active: !!window.isScreenShared,
                silent: false,
                interval_ms: prefs?.intervalMs || window.screenCaptureIntervalGlobal || 1000,
                quality: prefs?.quality || frame?.prefs?.quality || 0.98,
                max_dimension: prefs?.maxDimension || frame?.prefs?.maxDimension || 2560,
                format: prefs?.format || frame?.prefs?.format || 'png',
                mime_type: frame?.mimeType || 'image/jpeg',
                width: frame?.width || 0,
                height: frame?.height || 0,
                source_width: frame?.sourceWidth || 0,
                source_height: frame?.sourceHeight || 0,
                scale: typeof frame?.scale === 'number' ? frame.scale : 1,
                encoded_bytes: frame?.encodedBytes || (frame?.data ? Math.ceil((String(frame.data).length * 3) / 4) : 0),
                track_settings: frame?.trackSettings || {},
                sent_at: Date.now()
            },
            chat_attachments: buildAttachmentMeta(imageAttachments),
            realtime_input: {
                media_chunks: []
            },
            is_system_message: false // User message, even with image
        };

        // Add image chunk if available
        if (frame?.data) {
            payload.realtime_input.media_chunks.push({
                mime_type: frame.mimeType || "image/jpeg",
                data: frame.data
            });
        } else {
            console.warn("Could not capture image data to send with text.");
            // Optionally, send text anyway or notify user? For now, send text.
        }

        appendImageAttachmentChunks(payload.realtime_input.media_chunks, imageAttachments);

        // Add text chunk
        payload.realtime_input.media_chunks.push({
            mime_type: "text/plain",
            data: finalText
        });

    } else {
        // Standard text message payload (or system message)

        // Append current time if time perception is enabled and this is a user message (not system)
        let finalText = messageText;
        const timePerceptionEnabled = window.TimePerceptionAgentic?.isTimePerceptionEnabled?.() || false;

        let systemContextAppend = "";

        if (timePerceptionEnabled) {
            const now = new Date();
            const timeOptions = { hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short' };
            const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            systemContextAppend += "\n[SYSTEM: The current time is " + now.toLocaleTimeString([], timeOptions) + " on " + now.toLocaleDateString([], dateOptions) + "]";
        }

        // NEW: Persistent Transcription Reminder (Simplified)
        if (window.AudioProcessingControlsAgentic &&
            window.AudioProcessingControlsAgentic.TranscriptionModeState &&
            window.AudioProcessingControlsAgentic.TranscriptionModeState.isInlineTranscriptionEnabled()) {
            systemContextAppend += "\n[SYSTEM: Start your response with <Transcription-Start> tags NOW!]";
        }

        if (systemContextAppend && !isSystemMessage && !messageText.startsWith("[SYSTEM:")) {
            finalText += systemContextAppend;
        }

        payload = {
            source: imageAttachments.length ? "chat_image_attachment" : "text_message",
            chat_attachments: buildAttachmentMeta(imageAttachments),
            realtime_input: {
                media_chunks: []
            },
            is_system_message: isSystemMessage
        };
        appendImageAttachmentChunks(payload.realtime_input.media_chunks, imageAttachments);
        payload.realtime_input.media_chunks.push({
            mime_type: "text/plain",
            data: finalText
        });
    }

    // Send the constructed payload using waitForConnection
    waitForConnection(function () {
        try {
            webSocket.send(JSON.stringify(payload));
            console.log("Sent payload to server:", JSON.stringify(payload).substring(0, 100) + "...");
        } catch (error) {
            console.error("Error sending message:", error);
            displayMessage("System Message: Error sending message - " + error.message, true);
        }
    }, 1000);

    // Save to localStorage after adding a message
    saveChatToLocalStorage();
}

// Explicitly expose to window
window.sendTextMessage = sendTextMessage;
