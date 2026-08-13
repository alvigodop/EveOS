// js/modules/gemini/comm/mm_panel/scr_share/Screen_Share_MM_Commuication_Panel.js - Manages screen sharing and capture functionality for multimodal communication

console.log("js/modules/gemini/comm/mm_panel/scr_share/Screen_Share_MM_Commuication_Panel.js started loading");

// Initialize the ScreenSharePanel namespace
window.ScreenSharePanel = window.ScreenSharePanel || {};

// Define the base path for screen share related modules
const SCREEN_SHARE_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/mm_panel/scr_share';

// List of script files to load for screen share functionality
const screenShareScripts = [
    `${SCREEN_SHARE_BASE_PATH}/canvas_context_initialization/canvasContextState.js?v=65ab03055880`, // Declares the global state for the canvas 2D rendering context.
    `${SCREEN_SHARE_BASE_PATH}/screen_capture_functions/captureState.js?v=cdc42e8985a6`,
    `${SCREEN_SHARE_BASE_PATH}/screen_capture_functions/capturePreferences.js?v=afd5ebae3e69`,
    `${SCREEN_SHARE_BASE_PATH}/screen_capture_functions/captureSender.js?v=7e856451d390`,
    `${SCREEN_SHARE_BASE_PATH}/screen_capture_functions/frameProcessor.js?v=b847f7480b3d`,
    `${SCREEN_SHARE_BASE_PATH}/screen_capture_functions/captureStreamController.js?v=6490b79d44e4`,
    `${SCREEN_SHARE_BASE_PATH}/screen_capture_functions/screenCapture.js?v=b2f5bfa1f788`, // Handles UI interactions and communication
    `${SCREEN_SHARE_BASE_PATH}/canvas_context_initialization/canvasContextInitializer.js?v=1839dcbb6ea6`, // Initializes the global canvas 2D rendering context.
    `${SCREEN_SHARE_BASE_PATH}/screen_share_elements/canvasElementProvider.js?v=5c213a0c8b9e`, // Provides a global reference to the canvas DOM element.
    `${SCREEN_SHARE_BASE_PATH}/screen_share_elements/videoElementProvider.js?v=51d5704304ff` // Provides a global reference to the video DOM element.
];

// Function to load all screen share related scripts
function loadScreenShareScripts() {
    const fragment = document.createDocumentFragment();
    screenShareScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        // script.onload = initializeScreenShareModule; // Uncomment if needed for per-script initialization
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Initialize screen share functionality
function initializeScreenShareModule() {
    console.log("Initializing Screen Share Communication Panel module...");

    // Ensure the global namespace exists
    if (!window.ScreenSharePanel) {
        window.ScreenSharePanel = {};
    }

    // Functions from screenCapture.js will be globally available
    // If specific namespacing is needed, functions can be assigned here
    // Example:
    // window.ScreenSharePanel.startScreenShare = window.startScreenShare;
    // window.ScreenSharePanel.stopScreenShare = window.stopScreenShare;
    // window.ScreenSharePanel.captureImage = window.captureImage;

    console.log("Screen Share Communication Panel module initialized");
}

// Load scripts
loadScreenShareScripts();

// Initialize after a short delay to ensure scripts are loaded
setTimeout(initializeScreenShareModule, 500);

console.log("js/modules/gemini/Screen_Share_MM_Commuication_Panel/Screen_Share_MM_Commuication_Panel.js finished loading and initial execution");

// Export Screen Share Panel related functions/objects for global use
window.ScreenSharePanel = {
    // Placeholder for any panel-specific functions or state that might be centralized
    // For example:
    // startShare: null,
    // stopShare: null,
    // capture: null
};
