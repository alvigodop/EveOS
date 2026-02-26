window.ScreenShareMMCommunicationPanel = window.ScreenShareMMCommunicationPanel || {};
window.ScreenShareMMCommunicationPanel.CaptureStreamController = {
    startScreenShare: async function () {
        const State = window.ScreenShareMMCommunicationPanel.ScreenCaptureState;
        const Processor = window.ScreenShareMMCommunicationPanel.FrameProcessor;
        const Sender = window.ScreenShareMMCommunicationPanel.CaptureSender;

        try {
            // Clean up any existing screen share first
            this.stopScreenShare();

            window.stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 1 }
                },
            });

            const videoElement = State.getVideoElement();
            if (videoElement) {
                videoElement.srcObject = window.stream;
            } else {
                console.error("startScreenShare: videoElement is not available.");
                return;
            }

            await new Promise(resolve => {
                if (videoElement) {
                    videoElement.onloadedmetadata = () => {
                        console.log("video loaded metadata");
                        resolve();
                    }
                } else {
                    resolve();
                }
            });

            window.isScreenShared = true;
            if (typeof window.displayMessage === 'function') window.displayMessage("System Message: Screen sharing started successfully");

            // Initial capture
            const initialImageData = Processor.captureImage();
            if (initialImageData) {
                Sender.sendScreenCapture(initialImageData);
            }

            // UI updates
            const intervalInput = document.getElementById('screenCaptureIntervalInput');
            if (intervalInput) intervalInput.disabled = false;

            const settingsBtn = document.getElementById('screenCaptureSettingsButton');
            if (settingsBtn) settingsBtn.disabled = false;

            // Start interval
            // Get interval from settings (default 1000ms), checking global var first
            let intervalMs = 1000;
            if (typeof window.screenCaptureIntervalGlobal !== 'undefined') {
                intervalMs = window.screenCaptureIntervalGlobal;
            } else {
                intervalMs = parseInt(localStorage.getItem('screenCaptureInterval') || '1000', 10);
            }

            console.log(`Starting screen capture with interval: ${intervalMs}ms`);

            if (State.screenCaptureInterval) clearInterval(State.screenCaptureInterval);

            State.screenCaptureInterval = setInterval(() => {
                const imgData = Processor.captureImage();
                if (imgData) {
                    Sender.sendScreenCapture(imgData);
                }
            }, intervalMs);

            // Stop listener
            if (window.stream && window.stream.getVideoTracks()[0]) {
                window.stream.getVideoTracks()[0].addEventListener('ended', () => {
                    this.stopScreenShare();
                });
            }

        } catch (err) {
            console.error("Error accessing the screen: ", err);
            if (typeof window.displayMessage === 'function') window.displayMessage("System Message: Failed to start screen sharing: " + err.message);
            this.stopScreenShare();
        }
    },

    stopScreenShare: function () {
        const State = window.ScreenShareMMCommunicationPanel.ScreenCaptureState;

        if (window.stream) {
            window.stream.getTracks().forEach(track => track.stop());
            window.stream = null;
        }

        window.isScreenShared = false;

        const videoElement = State.getVideoElement();
        if (videoElement) {
            videoElement.style.display = 'none';
            videoElement.srcObject = null;
        }

        const button = document.getElementById('screenShareButton');
        if (button && button.querySelector('i')) {
            button.querySelector('i').textContent = 'screen_share';
        }

        // Only show message if we were actually sharing (simple check: if State.screenCaptureInterval was running)
        // But stopScreenShare is also called as cleanup, so we check isScreenShared before setting false, but here it's already set to false.
        // We can just log generic message or rely on caller context. 
        if (typeof window.displayMessage === 'function' && State.screenCaptureInterval) window.displayMessage("System Message: Screen sharing stopped");

        // Clear interval
        if (State.screenCaptureInterval) {
            clearInterval(State.screenCaptureInterval);
            State.screenCaptureInterval = null;
        }

        const intervalInput = document.getElementById('screenCaptureIntervalInput');
        if (intervalInput) intervalInput.disabled = true;

        const settingsBtn2 = document.getElementById('screenCaptureSettingsButton');
        if (settingsBtn2) settingsBtn2.disabled = true;

        State.resetContext();
    }
};
