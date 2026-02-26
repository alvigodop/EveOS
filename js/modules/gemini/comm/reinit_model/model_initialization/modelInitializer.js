// js/modules/gemini/model_initialization/modelInitializer.js

// Ensure the namespace exists
window.CommunicationPanel = window.CommunicationPanel || {};
window.CommunicationPanel.ReinitiateModelCommunicationPanel = window.CommunicationPanel.ReinitiateModelCommunicationPanel || {};

function initiateModel() {
    const currentShowVoiceAnnouncements = document.getElementById('voiceAnnouncementsToggle').checked;
    resetConnection();
    displayMessage(`System Message: Initiating model ${currentShowVoiceAnnouncements ? 'with' : 'without'} voice announcements...`);

    // Reinitiate logic should NOT clear chat history, only reset connection
    // document.getElementById('chatLog').innerHTML = ''; 
    // localStorage.removeItem('geminiChatHistory');

    // Connect with a slight delay to ensure clean connection
    setTimeout(() => {
        connect();

        // If voice announcements are enabled, send a test after connection is established
        if (currentShowVoiceAnnouncements) {
            setTimeout(() => {
                if (webSocket && webSocket.readyState === WebSocket.OPEN) {
                    const selectedVoice = document.getElementById('voiceSelect').value;
                    const voiceCheckText = `Voice check: This is a test of the ${selectedVoice} voice.`;
                    sendTextMessage(voiceCheckText, true); // Send as system message
                }
            }, 4000); // Wait for connection and model initialization
        }
    }, 1000);
}

// Expose the initialization function
window.CommunicationPanel.ReinitiateModelCommunicationPanel.initializeModelInitializer = function () {
    const initiateModelButton = document.getElementById('initiateModelButton');
    if (initiateModelButton) {
        initiateModelButton.addEventListener('click', initiateModel);
    } else {
        console.error("initiateModelButton not found for modelInitializer.js");
    }
}; 