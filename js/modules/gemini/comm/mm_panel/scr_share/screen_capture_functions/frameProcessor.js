window.ScreenShareMMCommunicationPanel = window.ScreenShareMMCommunicationPanel || {};
window.ScreenShareMMCommunicationPanel.FrameProcessor = {
    captureImage: function () {
        const State = window.ScreenShareMMCommunicationPanel.ScreenCaptureState;
        const videoElement = State.getVideoElement();
        const canvasElement = State.getCanvasElement();
        let context = State.getContext();

        if (!videoElement) {
            console.error("captureImage: videoElement is not initialized.");
            return null;
        }
        if (!canvasElement) {
            console.error("captureImage: canvasElement is not initialized.");
            return null;
        }

        // Try getting context again if missing
        if (!context) {
            context = State.getContext();
            if (!context) {
                console.error("captureImage: Failed to get 2D context");
                return null;
            }
        }

        if (window.stream && videoElement && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
            try {
                const Prefs = window.ScreenShareMMCommunicationPanel.CapturePreferences;
                const prefs = Prefs ? Prefs.get() : { maxDimension: 1920, quality: 0.95 };
                const sourceWidth = videoElement.videoWidth;
                const sourceHeight = videoElement.videoHeight;
                const maxSide = Math.max(sourceWidth, sourceHeight);
                const scale = maxSide > prefs.maxDimension ? prefs.maxDimension / maxSide : 1;
                const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
                const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

                // Preserve high-quality source frames while bounding payload size.
                canvasElement.width = targetWidth;
                canvasElement.height = targetHeight;

                // Draw the current video frame
                context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

                // Get image data with better quality
                const imageData = canvasElement.toDataURL("image/jpeg", prefs.quality);

                // Store in global state as per original logic (optional, but good for consistency)
                const base64Data = imageData.split(",")[1].trim();
                window.currentFrameB64 = base64Data;

                return base64Data;

            } catch (error) {
                console.error("Error capturing screen:", error);
                if (typeof window.displayMessage === 'function') window.displayMessage("Error capturing screen. Please try again.");
                return null;
            }
        }
        else {
            // Logs only if we expect it to work (stream exists) but metadata might be missing
            if (window.stream) {
                console.log("Screen capture failed: video metadata not ready yet.");
            }
            return null;
        }
    }
};
