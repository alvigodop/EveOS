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
                quality: 0.95,
                maxDimension: 1920,
                silentObservation: false
            };
            const payload = {
                source: "screen_share",
                silent_response: !!prefs.silentObservation,
                screen_share: {
                    active: !!window.isScreenShared,
                    silent: !!prefs.silentObservation,
                    interval_ms: prefs.intervalMs,
                    quality: prefs.quality,
                    max_dimension: prefs.maxDimension,
                    sent_at: Date.now()
                },
                realtime_input: {
                    media_chunks: [
                        {
                            mime_type: "image/jpeg",
                            data: imageData
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
