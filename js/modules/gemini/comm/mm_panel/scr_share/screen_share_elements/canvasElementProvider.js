// js/modules/gemini/comm/mm_panel/scr_share/screen_share_elements/canvasElementProvider.js
// Provides a function to initialize and provide a global reference to the main canvas DOM element.

console.log("js/modules/gemini/comm/mm_panel/scr_share/screen_share_elements/canvasElementProvider.js started loading");

window.ScreenShareMMCommunicationPanel = window.ScreenShareMMCommunicationPanel || {};
window.ScreenShareMMCommunicationPanel.ScreenShareElements = window.ScreenShareMMCommunicationPanel.ScreenShareElements || {};

window.ScreenShareMMCommunicationPanel.ScreenShareElements.initializeCanvasElement = function () {
    console.log("ScreenShareMMCommunicationPanel.ScreenShareElements.initializeCanvasElement called.");
    const canvas = document.getElementById("canvasElement");

    if (canvas) {
        window.canvas = canvas; // Set global reference
        console.log("Global 'window.canvas' DOM element reference initialized by canvasElementProvider.js");
        return canvas; // Return the element for potential chaining
    } else {
        console.error("DOM element with ID 'canvasElement' not found by canvasElementProvider.js. Ensure 'canvasElement' exists in the HTML.");
        return null;
    }
};

console.log("js/modules/gemini/comm/mm_panel/scr_share/screen_share_elements/canvasElementProvider.js finished loading"); 