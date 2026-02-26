/**
 * transcriptionBoxParser.js
 * Extracts and parses <Transcribe-Start>...<Transcribe-End> blocks from model responses
 */

window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

window.AudioProcessingControlsAgentic.TranscriptionBoxParser = {
    // Lenient regex to catch variations: <Transcribe-Start>, <Transcription-Start>, <SPEECH-START>, <Speech-Start>, 
    // even with bolding like **<Transcribe-Start>** or model hallucinations.
    TRANSCRIPTION_PATTERN: /\*?\*?<(?:Transcribe|Transcription|SPEECH|Speech)[-_]Start>\*?\*?\s*([\s\S]*?)\s*\*?\*?<\/(?:Transcribe|Transcription|SPEECH|Speech)[-_]End>\*?\*?/gi,

    /**
     * Extract all transcription blocks from text
     * @param {string} text - The text to parse
     * @returns {Array} Array of extracted transcriptions
     */
    extractTranscriptionBlocks: function (text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const transcriptions = [];
        let match;

        // Use a fresh regex each time to avoid stateful matches
        const regex = new RegExp(this.TRANSCRIPTION_PATTERN.source, this.TRANSCRIPTION_PATTERN.flags);

        while ((match = regex.exec(text)) !== null) {
            const transcriptionText = match[1].trim();
            if (transcriptionText) {
                transcriptions.push({
                    raw: match[0],
                    text: transcriptionText,
                    startIndex: match.index,
                    endIndex: match.index + match[0].length
                });
            }
        }

        if (transcriptions.length > 0) {
            console.log(`[Transcription Parser] Found ${transcriptions.length} transcription block(s)`);
        }

        return transcriptions;
    },

    /**
     * Remove transcription boxes from text (for display purposes)
     * @param {string} text - The text to clean
     * @returns {string} Text with transcription boxes removed
     */
    removeTranscriptionBoxes: function (text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        return text.replace(this.TRANSCRIPTION_PATTERN, '').trim();
    },

    /**
     * Extract first transcription only
     * @param {string} text - The text to parse
     * @returns {string|null} First transcription text or null
     */
    getFirstTranscription: function (text) {
        const blocks = this.extractTranscriptionBlocks(text);
        return blocks.length > 0 ? blocks[0].text : null;
    },

    /**
     * Check if text contains any transcription boxes
     * @param {string} text - The text to check
     * @returns {boolean} True if transcription boxes found
     */
    hasTranscriptionBlocks: function (text) {
        if (!text || typeof text !== 'string') {
            return false;
        }

        return this.TRANSCRIPTION_PATTERN.test(text);
    }
};

console.log('[Transcription Box Parser] Initialized');
