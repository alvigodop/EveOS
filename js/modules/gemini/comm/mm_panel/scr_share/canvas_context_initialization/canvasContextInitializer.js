// js/modules/gemini/comm/mm_panel/scr_share/canvas_context_initialization/canvasContextInitializer.js
// Provides a function to initialize the canvas 2D rendering context.

console.log("js/modules/gemini/comm/mm_panel/scr_share/canvas_context_initialization/canvasContextInitializer.js started loading");

window.ScreenShareMMCommunicationPanel = window.ScreenShareMMCommunicationPanel || {};
window.ScreenShareMMCommunicationPanel.CanvasContextInitialization = window.ScreenShareMMCommunicationPanel.CanvasContextInitialization || {};

window.ScreenShareMMCommunicationPanel.CanvasContextInitialization.initializeCanvasContext = function (canvasElement) {
    console.log("ScreenShareMMCommunicationPanel.CanvasContextInitialization.initializeCanvasContext called.");
    // Initializes window.context, which is globally declared (e.g., in canvasContextState.js)
    if (canvasElement) {
        window.context = canvasElement.getContext("2d");
        console.log("Global 'window.context' initialized by canvasContextInitializer.js with canvas 2D rendering context.");
    } else {
        console.error("Canvas element not provided to initializeCanvasContext.");
    }
};

console.log("js/modules/gemini/comm/mm_panel/scr_share/canvas_context_initialization/canvasContextInitializer.js finished loading"); 