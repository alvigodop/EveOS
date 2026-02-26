
(function () {
    const originalShowIncomingMessage = window.showIncomingMessage;

    window.showIncomingMessage = function (text, isTranscription, audioData) {
        console.log("%c[DEBUG TRANSCRIPTION] Raw Text Chunk:", "background: #222; color: #bada55", text);
        if (originalShowIncomingMessage) {
            originalShowIncomingMessage(text, isTranscription, audioData);
        }
    };

    console.log("[DEBUG] Transcription Debugger Injected");
})();
