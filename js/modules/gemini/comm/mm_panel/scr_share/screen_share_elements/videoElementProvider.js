// js/modules/gemini/comm/mm_panel/scr_share/screen_share_elements/videoElementProvider.js
// Provides a function to initialize and provide a global reference to the main video DOM element.

console.log("js/modules/gemini/comm/mm_panel/scr_share/screen_share_elements/videoElementProvider.js started loading");

window.ScreenShareMMCommunicationPanel = window.ScreenShareMMCommunicationPanel || {};
window.ScreenShareMMCommunicationPanel.ScreenShareElements = window.ScreenShareMMCommunicationPanel.ScreenShareElements || {};

window.ScreenShareMMCommunicationPanel.ScreenShareElements.initializeVideoElement = function () {
    console.log("ScreenShareMMCommunicationPanel.ScreenShareElements.initializeVideoElement called.");
    const video = document.getElementById("videoElement"); // Intended to be global for other scripts

    if (video) {
        window.video = video; // Set global reference
        console.log("Global 'window.video' DOM element reference initialized by videoElementProvider.js");
        return video; // Return the element for potential chaining
    } else {
        console.error("DOM element with ID 'videoElement' not found by videoElementProvider.js. Ensure 'videoElement' exists in the HTML.");
        return null;
    }
};

console.log("js/modules/gemini/comm/mm_panel/scr_share/screen_share_elements/videoElementProvider.js finished loading"); 