window.ScreenShareMMCommunicationPanel = window.ScreenShareMMCommunicationPanel || {};
window.ScreenShareMMCommunicationPanel.ScreenCaptureState = {
    screenCaptureInterval: null,

    // Getters for global elements (managed by loader or other scripts)
    getVideoElement: () => window.video, // window.video is set by video_canvas_elements_loader.js
    getCanvasElement: () => window.canvas, // window.canvas is set by video_canvas_elements_loader.js

    // Canvas context is lazily initialized
    contextForCapture: null,

    getContext: function () {
        if (!this.contextForCapture) {
            const canvas = this.getCanvasElement();
            if (canvas) {
                this.contextForCapture = canvas.getContext("2d");
            }
        }
        return this.contextForCapture;
    },

    resetContext: function () {
        this.contextForCapture = null;
    }
};
