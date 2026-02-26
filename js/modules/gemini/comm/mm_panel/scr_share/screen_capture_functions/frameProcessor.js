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
                // Set canvas size to match video dimensions
                canvasElement.width = videoElement.videoWidth;
                canvasElement.height = videoElement.videoHeight;

                // Draw the current video frame
                context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

                // Get image data with better quality
                const imageData = canvasElement.toDataURL("image/jpeg", 0.95);

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
