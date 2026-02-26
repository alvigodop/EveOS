/**
 * Handles event listeners for the start and stop voice input buttons.
 */

// Ensure the namespace exists
window.CommunicationPanel = window.CommunicationPanel || {};
window.CommunicationPanel.MultimodalCommunicationPanel = window.CommunicationPanel.MultimodalCommunicationPanel || {};
window.CommunicationPanel.MultimodalCommunicationPanel.VoiceInputMMCommunicationPanel = window.CommunicationPanel.MultimodalCommunicationPanel.VoiceInputMMCommunicationPanel || {};
window.CommunicationPanel.MultimodalCommunicationPanel.VoiceInputMMCommunicationPanel.VoiceInputButtonHandlers = window.CommunicationPanel.MultimodalCommunicationPanel.VoiceInputMMCommunicationPanel.VoiceInputButtonHandlers || {};

/**
 * Initializes the voice input button handlers by finding the buttons
 * and attaching event listeners.
 */
window.CommunicationPanel.MultimodalCommunicationPanel.VoiceInputMMCommunicationPanel.VoiceInputButtonHandlers.initializeVoiceInputButtonHandlers = function () {
    console.log('VoiceInputButtonHandlers.initializeVoiceInputButtonHandlers called.');
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');

    if (startButton && stopButton) {
        startButton.addEventListener('click', async () => {
            // Stop audio if "Barge-in" is enabled
            if (localStorage.getItem('stopAudioOnInput') === 'true' && typeof stopAllAudioPlayback === 'function') {
                stopAllAudioPlayback();
            }

            // startAudioInput is expected to be globally available from audioCapture.js
            if (typeof window.startAudioInput === 'function') {
                await window.startAudioInput();
                startButton.disabled = true;
                stopButton.disabled = false;
            } else {
                console.error('startAudioInput function not found.');
            }
        });

        stopButton.addEventListener('click', () => {
            // stopAudioInput is expected to be globally available from audioCapture.js
            if (typeof window.stopAudioInput === 'function') {
                window.stopAudioInput();
                startButton.disabled = false;
                stopButton.disabled = true;
            } else {
                console.error('stopAudioInput function not found.');
            }
        });

        // Initialize stop button as disabled
        stopButton.disabled = true;
        console.log('Voice input button handlers initialized successfully.');
    } else {
        if (!startButton) console.error('Start button (startButton) not found for voice input handler.');
        if (!stopButton) console.error('Stop button (stopButton) not found for voice input handler.');
    }
}; 