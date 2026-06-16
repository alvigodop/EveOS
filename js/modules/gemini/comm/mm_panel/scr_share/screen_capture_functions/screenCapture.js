// Main screen capture orchestration
// Modularized version

window.ScreenShareMMCommunicationPanel = window.ScreenShareMMCommunicationPanel || {};
window.ScreenShareMMCommunicationPanel.ScreenCaptureFunctions = window.ScreenShareMMCommunicationPanel.ScreenCaptureFunctions || {};

// Aliases for global functions (for backward compatibility if needed, or internal use)
// We expose the controller functions globally as before because some UI buttons might call them directly?
// Checked original code: only 'startScreenShare' and 'stopScreenShare' were top-level functions (not attached to window directly but defined in scope).
// But 'initializeScreenCaptureFeature' attaches the event listeners.

// We will expose start/stop on the global window object just in case, or keep them local.
// The original code defined them as function declarations, which in global scope (script tag) become window properties.
// So we should maintain that.

window.startScreenShare = function () {
    window.ScreenShareMMCommunicationPanel.CaptureStreamController.startScreenShare();
};

window.stopScreenShare = function () {
    window.ScreenShareMMCommunicationPanel.CaptureStreamController.stopScreenShare();
};

// Also expose captureImage and sendScreenCapture if other scripts used them
window.captureImage = function () {
    return window.ScreenShareMMCommunicationPanel.FrameProcessor.captureImage();
};

window.sendScreenCapture = function (data) {
    window.ScreenShareMMCommunicationPanel.CaptureSender.sendScreenCapture(data);
};


// Initialization function
window.ScreenShareMMCommunicationPanel.ScreenCaptureFunctions.initializeScreenCaptureFeature = function (screenShareButtonElement) {
    console.log("ScreenCaptureFunctions: Initializing screen capture feature (Modularized)...");

    // Dependencies
    const State = window.ScreenShareMMCommunicationPanel.ScreenCaptureState;
    const Controller = window.ScreenShareMMCommunicationPanel.CaptureStreamController;

    const videoElement = State.getVideoElement();
    const canvasElement = State.getCanvasElement();

    if (!videoElement) {
        console.error("initializeScreenCaptureFeature: window.video is not defined.");
    }
    if (!canvasElement) {
        console.error("initializeScreenCaptureFeature: window.canvas is not defined.");
    }

    if (screenShareButtonElement) {
        screenShareButtonElement.removeEventListener('click', window.screenShareToggleHandler); // Remove if exists (custom hack)

        window.screenShareToggleHandler = async () => {
            console.log("Screen Share Button Clicked! Handler triggered."); // Debug Log
            if (window.isScreenShared && window.stream) {
                Controller.stopScreenShare();
            } else {
                if (!State.getVideoElement()) {
                    console.error("Screen share button click: video element not found!");
                    if (typeof window.displayMessage === 'function') window.displayMessage("Error: Video element not found.", true);
                    return;
                }

                await Controller.startScreenShare();

                const vid = State.getVideoElement();
                if (window.isScreenShared && vid) {
                    vid.style.display = 'block';
                    screenShareButtonElement.querySelector('i').textContent = 'stop_screen_share';
                } else {
                    screenShareButtonElement.querySelector('i').textContent = 'screen_share';
                    if (vid) vid.style.display = 'none';
                }
            }
        };

        screenShareButtonElement.addEventListener('click', window.screenShareToggleHandler);
    } else {
        console.error("initializeScreenCaptureFeature: screenShareButtonElement is null.");
    }

    // Initialize Dialog Logic
    const screenCaptureSettingsDialog = document.getElementById('screenCaptureSettingsDialog');
    const screenCaptureSettingsSave = document.getElementById('screenCaptureSettingsSave');
    const screenCaptureSettingsCancel = document.getElementById('screenCaptureSettingsCancel');
    const Prefs = window.ScreenShareMMCommunicationPanel.CapturePreferences;

    if (screenCaptureSettingsDialog) {
        if (typeof screenCaptureSettingsDialog.showModal !== 'function') {
            if (window.dialogPolyfill) {
                window.dialogPolyfill.registerDialog(screenCaptureSettingsDialog);
            }
        }

        if (screenCaptureSettingsSave) {
            // Remove old listener if possible (hard without reference), but adding new one is fine if we assume reload
            screenCaptureSettingsSave.onclick = function () { // Use onclick to override previous
                if (Prefs) {
                    const prefs = Prefs.readFromFields();
                    Prefs.restartIntervalIfSharing();
                    if (typeof window.displayMessage === 'function') {
                        const mode = prefs.silentObservation ? 'silent observation' : 'response allowed';
                        window.displayMessage(`System Message: Screen capture set to ${prefs.intervalMs}ms (${mode}).`, true);
                    }
                }
                if (screenCaptureSettingsDialog.close) screenCaptureSettingsDialog.close();
            };
        }

        if (screenCaptureSettingsCancel) {
            screenCaptureSettingsCancel.onclick = function () {
                if (screenCaptureSettingsDialog.close) screenCaptureSettingsDialog.close();
            };
        }
    } else {
        console.log("initializeScreenCaptureFeature: Settings dialog not found.");
    }

    console.log("ScreenCaptureFunctions: Modularized initialization complete.");
};
