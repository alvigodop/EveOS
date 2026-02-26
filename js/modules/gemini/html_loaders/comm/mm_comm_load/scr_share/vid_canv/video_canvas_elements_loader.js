/**
 * Loads the Video and Canvas elements HTML component.
 */
async function loadVideoCanvasElements(screenShareButton) {
    const placeholder = document.getElementById('video-canvas-elements-placeholder');
    if (!placeholder) {
        console.warn('Video and Canvas elements placeholder not found.');
        return;
    }

    try {
        const html = `
<!-- Video Element -->
<video id="videoElement" autoplay style="width: 640px; height: 480px;"></video>

<!-- Hidden Canvas -->
<canvas id="canvasElement" style="width: 640px; height: 480px;"></canvas>
`;
        placeholder.innerHTML = html;

        // Upgrade MDL components if necessary - not strictly needed for video/canvas but good practice
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('Video and Canvas elements HTML loaded and MDL components upgraded.');

        // Re-initialize global references and hide video element
        // Assuming 'video' and 'canvas' are intended to be global.
        // This mimics the structure of how other elements like videoElementProvider.js work
        // but for now, let's re-query them.
        window.video = document.getElementById('videoElement');
        window.canvas = document.getElementById('canvasElement');

        if (window.video) {
            window.video.style.display = 'none';
            console.log('Global video element reference updated and video hidden.');
        } else {
            console.error('videoElement not found after loading HTML component.');
        }
        if (!window.canvas) {
            console.error('canvasElement not found after loading HTML component.');
        }

        // Initialize screen capture functionality now that elements are available
        if (window.ScreenShareMMCommunicationPanel &&
            window.ScreenShareMMCommunicationPanel.ScreenCaptureFunctions &&
            typeof window.ScreenShareMMCommunicationPanel.ScreenCaptureFunctions.initializeScreenCaptureFeature === 'function') {
            window.ScreenShareMMCommunicationPanel.ScreenCaptureFunctions.initializeScreenCaptureFeature(screenShareButton);
        } else {
            console.error('initializeScreenCaptureFeature function not found. Screen capture may not work.');
        }

        return true;

    } catch (error) {
        console.error('Error loading Video and Canvas elements card:', error);
        return false;
    }
}

// Expose the loader function
window.MediaDisplayElementsHTMLLoader = window.MediaDisplayElementsHTMLLoader || {};
window.MediaDisplayElementsHTMLLoader.loadVideoCanvasElements = loadVideoCanvasElements; 