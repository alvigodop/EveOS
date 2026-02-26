window.ScreenShareMMCommunicationPanel = window.ScreenShareMMCommunicationPanel || {};
window.ScreenShareMMCommunicationPanel.CaptureSender = {
    sendScreenCapture: function (imageData) {
        if (window.webSocket == null || window.webSocket.readyState !== WebSocket.OPEN || !imageData) {
            // Quietly fail if socket not open, as this runs on interval
            return;
        }

        try {
            const payload = {
                realtime_input: {
                    media_chunks: [{
                        mime_type: "image/jpeg",
                        data: imageData
                    }]
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
