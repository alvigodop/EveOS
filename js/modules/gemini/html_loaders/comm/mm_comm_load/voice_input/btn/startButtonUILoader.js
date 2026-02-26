/**
 * Loads the Start Button HTML component.
 */

async function loadStartButton() {
    const placeholder = document.getElementById('start-button-placeholder');
    if (!placeholder) {
        console.warn('Start Button placeholder not found.');
        return false; // Indicate failure
    }

    try {
        const html = `
<button id="startButton"
    class="mdl-button mdl-js-button mdl-button--fab mdl-button--mini-fab mdl-button--colored"
    title="Start Voice Input">
    <i class="material-icons">mic</i>
</button>
`;
        placeholder.innerHTML = html;

        // Upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('Start Button HTML loaded and MDL components upgraded.');

        // Initialize the voice input button handlers after the HTML is loaded and upgraded
        // Ensure the namespace and function exist
        // Removed premature call to initializeVoiceInputButtonHandlers
        // if (window.VoiceInputMMCommunicationPanel && 
        //     window.VoiceInputMMCommunicationPanel.VoiceInputButtonHandlers &&
        //     typeof window.VoiceInputMMCommunicationPanel.VoiceInputButtonHandlers.initializeVoiceInputButtonHandlers === 'function') {

        //     // It might be better to initialize the handlers once both start and stop buttons are loaded
        //     // For now, we'll call the function, but this may need adjustment if stopButton is loaded separately.
        //     // The voiceInputButtonHandler.js file should handle finding both buttons.
        //     window.VoiceInputMMCommunicationPanel.VoiceInputButtonHandlers.initializeVoiceInputButtonHandlers();
        //     console.log('Voice input button handlers initialized (might need stop button too).');
        // } else {
        //     console.error('VoiceInputMMCommunicationPanel namespace or initializeVoiceInputButtonHandlers function not found. Voice input buttons may not work.');
        // }

        return true; // Indicate success

    } catch (error) {
        console.error('Error loading Start Button HTML:', error);
        return false; // Indicate failure
    }
}

// Expose the loader function globally or via a namespace
window.loadStartButton = loadStartButton; 