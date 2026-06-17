function sendTextMessage(text, isSystemMessage = false) {
    if (!isSystemMessage && !text.startsWith("[SYSTEM:")) {
        // Regular user message, reset consecutive self-talks counter
        consecutiveSelfTalks = 0;
    }

    let payload;

    // If screen sharing is active, capture and send frame WITH the text in the same payload
    if (isScreenShared && !isSystemMessage && !text.startsWith("[SYSTEM:")) {
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
        const textWithRole = `[USER asks while sharing screen]: ${text}`;

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

        // Add text chunk
        payload.realtime_input.media_chunks.push({
            mime_type: "text/plain",
            data: finalText
        });

    } else {
        // Standard text message payload (or system message)

        // Append current time if time perception is enabled and this is a user message (not system)
        let finalText = text;
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

        if (systemContextAppend && !isSystemMessage && !text.startsWith("[SYSTEM:")) {
            finalText += systemContextAppend;
        }

        payload = {
            realtime_input: {
                media_chunks: [{
                    mime_type: "text/plain",
                    data: finalText
                }]
            },
            is_system_message: isSystemMessage
        };
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
