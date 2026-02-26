// js/modules/gemini/voice_operations/voiceAnnouncementTester.js

function testVoiceAnnouncement() {
    if (typeof webSocket !== 'undefined' && webSocket && webSocket.readyState === WebSocket.OPEN) {
        const selectedVoice = document.getElementById('voiceSelect').value;
        const voiceCheckText = `Voice check: This is a test of the ${selectedVoice} voice.`;
        if (typeof sendTextMessage === 'function') {
            sendTextMessage(voiceCheckText, true); // Send as system message
        } else {
            console.error('sendTextMessage function not found for voice announcement test.');
        }
        console.log("Sent voice test message");
        if (typeof displayMessage === 'function') {
            displayMessage("System Message: Testing voice announcement...", true);
        } else {
            console.error('displayMessage function not found for voice announcement test.');
        }
    } else {
        if (typeof displayMessage === 'function') {
            displayMessage("System Message: Cannot test voice - WebSocket not connected", true);
        } else {
            console.error('displayMessage function not found for voice announcement test.');
        }
    }
} 