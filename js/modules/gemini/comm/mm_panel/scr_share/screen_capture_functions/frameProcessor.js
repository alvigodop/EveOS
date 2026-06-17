window.ScreenShareMMCommunicationPanel = window.ScreenShareMMCommunicationPanel || {};
window.ScreenShareMMCommunicationPanel.FrameProcessor = {
    normalizeFrame: function (frame, fallbackPrefs) {
        if (!frame) return null;
        if (typeof frame === 'string') {
            return {
                data: frame,
                mimeType: 'image/jpeg',
                width: 0,
                height: 0,
                sourceWidth: 0,
                sourceHeight: 0,
                scale: 1,
                encodedBytes: Math.ceil((frame.length * 3) / 4),
                prefs: fallbackPrefs || null
            };
        }
        if (frame.data) {
            return Object.assign({
                mimeType: 'image/jpeg',
                width: 0,
                height: 0,
                sourceWidth: 0,
                sourceHeight: 0,
                scale: 1,
                encodedBytes: Math.ceil((String(frame.data).length * 3) / 4),
                prefs: fallbackPrefs || null
            }, frame);
        }
        return null;
    },

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
                const prefs = Prefs ? Prefs.get() : { maxDimension: 2560, quality: 0.98, format: 'png' };
                const sourceWidth = videoElement.videoWidth;
                const sourceHeight = videoElement.videoHeight;
                const maxSide = Math.max(sourceWidth, sourceHeight);
                const scale = maxSide > prefs.maxDimension ? prefs.maxDimension / maxSide : 1;
                const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
                const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
                const format = String(prefs.format || 'png').toLowerCase();
                const mimeType = format === 'jpeg' || format === 'jpg'
                    ? 'image/jpeg'
                    : (format === 'webp' ? 'image/webp' : 'image/png');

                // Preserve high-quality source frames while bounding payload size.
                canvasElement.width = targetWidth;
                canvasElement.height = targetHeight;
                if ('imageSmoothingEnabled' in context) {
                    context.imageSmoothingEnabled = true;
                }
                if ('imageSmoothingQuality' in context) {
                    context.imageSmoothingQuality = 'high';
                }

                // Draw the current video frame
                context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

                const imageData = canvasElement.toDataURL(mimeType, prefs.quality);

                // Store in global state as per original logic (optional, but good for consistency)
                const base64Data = imageData.split(",")[1].trim();
                window.currentFrameB64 = base64Data;
                const track = window.stream?.getVideoTracks?.()[0] || null;
                const trackSettings = track?.getSettings ? track.getSettings() : {};
                const frame = {
                    data: base64Data,
                    mimeType,
                    width: targetWidth,
                    height: targetHeight,
                    sourceWidth,
                    sourceHeight,
                    scale,
                    encodedBytes: Math.ceil((base64Data.length * 3) / 4),
                    trackSettings,
                    prefs: {
                        format: prefs.format,
                        quality: prefs.quality,
                        maxDimension: prefs.maxDimension
                    }
                };
                window.currentFrameMeta = frame;

                return frame;

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
