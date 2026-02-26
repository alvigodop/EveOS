/**
 * transcriptionTagHandler.js
 * Processes extracted transcription tags and routes to audio pipeline
 */

window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

window.AudioProcessingControlsAgentic.TranscriptionTagHandler = {
    /**
     * Process transcription blocks from model response
     * Extracts them and sends to audio processing pipeline
     * @param {string} responseText - The full model response text
     * @returns {object} { cleanedText, transcriptions } - Response without boxes + extracted transcriptions
     */
    processTranscriptionTags: function (responseText) {
        if (!responseText || typeof responseText !== 'string') {
            return { cleanedText: responseText, transcriptions: [] };
        }

        // DEBUG: Print raw text to see if tags are present
        console.log("[Transcription Debug] Raw incoming text:", responseText);

        // Check if extraction (wrapping) is enabled
        if (!window.AudioProcessingControlsAgentic.TranscriptionModeState.isExtractionEnabled()) {
            return { cleanedText: responseText, transcriptions: [] };
        }

        // Extract transcription blocks
        const transcriptions = window.AudioProcessingControlsAgentic.TranscriptionBoxParser.extractTranscriptionBlocks(responseText);

        // Remove transcription boxes from display text
        const cleanedText = window.AudioProcessingControlsAgentic.TranscriptionBoxParser.removeTranscriptionBoxes(responseText);

        if (transcriptions.length > 0) {
            console.log(`[Transcription Handler] Processing ${transcriptions.length} transcription(s) for audio pipeline`);

            // Route first transcription to audio processing
            if (transcriptions.length > 0) {
                this.routeToAudioPipeline(transcriptions[0].text);
            }
        }

        return { cleanedText, transcriptions };
    },

    /**
     * Route transcription text to the audio processing pipeline
     * This mimics how your app normally processes model responses for audio
     * @param {string} transcriptionText - The text to convert to audio
     */
    routeToAudioPipeline: function (transcriptionText) {
        if (!transcriptionText) {
            console.warn('[Transcription Handler] No transcription text to route');
            return;
        }

        console.log('[Transcription Handler] Routing to audio pipeline:', transcriptionText.substring(0, 100) + '...');

        // Format as model message for the audio pipeline
        const formattedMessage = `GEMINI: ${transcriptionText}`;

        // Call showIncomingMessage if available (your existing audio handler)
        if (typeof showIncomingMessage === 'function') {
            showIncomingMessage(formattedMessage, false);
        } else {
            console.warn('[Transcription Handler] showIncomingMessage function not available');
        }
    }
};

console.log('[Transcription Tag Handler] Initialized');
