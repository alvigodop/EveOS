window.ScreenShareMMCommunicationPanel = window.ScreenShareMMCommunicationPanel || {};
window.ScreenShareMMCommunicationPanel.CaptureSender = {
    sendScreenCapture: function (imageData) {
        if (window.webSocket == null || window.webSocket.readyState !== WebSocket.OPEN || !imageData) {
            // Quietly fail if socket not open, as this runs on interval
            return;
        }

        try {
            const Prefs = window.ScreenShareMMCommunicationPanel.CapturePreferences;
            const prefs = Prefs ? Prefs.get() : {
                intervalMs: 1000,
                quality: 0.98,
                maxDimension: 2560,
                format: 'png',
                silentObservation: false
            };
            const Processor = window.ScreenShareMMCommunicationPanel.FrameProcessor;
            const frame = Processor?.normalizeFrame
                ? Processor.normalizeFrame(imageData, prefs)
                : (typeof imageData === 'string' ? { data: imageData, mimeType: 'image/jpeg' } : imageData);
            if (!frame?.data) return;
            const payload = {
                source: "screen_share",
                silent_response: !!prefs.silentObservation,
                screen_share: {
                    active: !!window.isScreenShared,
                    silent: !!prefs.silentObservation,
                    interval_ms: prefs.intervalMs,
                    quality: prefs.quality,
                    max_dimension: prefs.maxDimension,
                    format: prefs.format,
                    mime_type: frame.mimeType,
                    width: frame.width || 0,
                    height: frame.height || 0,
                    source_width: frame.sourceWidth || 0,
                    source_height: frame.sourceHeight || 0,
                    scale: typeof frame.scale === 'number' ? frame.scale : 1,
                    encoded_bytes: frame.encodedBytes || Math.ceil((String(frame.data).length * 3) / 4),
                    track_settings: frame.trackSettings || {},
                    sent_at: Date.now()
                },
                realtime_input: {
                    media_chunks: [
                        {
                            mime_type: frame.mimeType || "image/jpeg",
                            data: frame.data
                        },
                        {
                            mime_type: "text/plain",
                            data: Prefs ? Prefs.buildInstruction(prefs) : "[SCREEN SHARE OBSERVATION] Use this image as passive screen context."
                        }
                    ]
                }
            };

            window.webSocket.send(JSON.stringify(payload));
            // frequent log
            // console.log("Screen capture sent to server");
        } catch (error) {
            console.error("Error sending screen capture:", error);
            if (typeof window.displayMessage === 'function') window.displayMessage("Error sending screen capture. Please try again.");
        }
    }
};
