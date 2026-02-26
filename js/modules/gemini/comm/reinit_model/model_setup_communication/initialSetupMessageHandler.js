/**
 * initialSetupMessageHandler.js
 * Main entry point for initializing the Gemini model session.
 * Delegates logic to setupMessageCreator.js and sessionFlowManager.js.
 */

function sendInitialSetupMessage() {
    const selectedVoice = document.getElementById('voiceSelect').value;

    if (typeof displayMessage === 'function') {
        displayMessage("System Message: Initializing model with voice: " + selectedVoice, true);
    }

    // Ensure modules are loaded
    if (!window.ModelSetupCore || !window.ModelSetupCore.createSetupMessage || !window.ModelSetupCore.SessionFlowManager) {
        console.error("Critical: ModelSetupCore modules not loaded. Cannot send initial setup.");
        if (typeof displayMessage === 'function') displayMessage("Error: Model Setup Core modules missing.", true);
        return;
    }

    // Prepare global variable for sequential audio play (assuming it's available globally as in original code)
    const currentSequentialAudioPlay = (typeof sequentialAudioPlay !== 'undefined') ? sequentialAudioPlay : false;

    // Create configuration object
    const setupMessage = window.ModelSetupCore.createSetupMessage(selectedVoice, currentSequentialAudioPlay);

    // Check connection and start sequence
    if (window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
        // Wait slightly before starting the sequence to ensure connection stability if just reconnected
        setTimeout(() => {
            // Re-check connection
            if (window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
                window.ModelSetupCore.SessionFlowManager.runInitializationSequence(setupMessage, selectedVoice);
            } else {
                handleConnectionError("WebSocket not ready for setup.");
            }
        }, 1500);
    } else {
        handleConnectionError("Connection error - trying to reconnect...");
    }
}

function handleConnectionError(msg) {
    if (typeof displayMessage === 'function') displayMessage(`System Message: ${msg}`, true);
    // Logic for reconnecting could be triggered here if needed, but avoiding recursive loops
}