/**
 * transcriptionSystemInstructions.js
 * Generates system instructions for inline transcription mode
 */

window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

window.AudioProcessingControlsAgentic.TranscriptionSystemInstructions = {
    /**
     * Get the system instruction injection for inline transcription
     * This mimics the time perception pattern used in your app
     * @returns {string} System instruction to inject into prompts
     */
    getInlineTranscriptionInstruction: function () {
        if (window.AudioProcessingControlsAgentic && window.AudioProcessingControlsAgentic.TranscriptionModeState) {
            return window.AudioProcessingControlsAgentic.TranscriptionModeState.getInjectionPrompt();
        }
        return "";
    },

    /**
     * Get the full system instruction to inject into model prompts
     * Similar to how you inject time information
     * @returns {string} Full system instruction
     */
    buildSystemInstruction: function () {
        const instruction = this.getInlineTranscriptionInstruction();
        return `${instruction}

Important: The transcription box should contain exactly what the model intends to say aloud. Keep it natural and conversational, not technical.`;
    },

    /**
     * Check if instruction should be injected (when inline mode is active)
     * @returns {boolean} True if instruction should be added to prompts
     */
    shouldInjectInstruction: function () {
        return window.AudioProcessingControlsAgentic &&
            window.AudioProcessingControlsAgentic.TranscriptionModeState &&
            window.AudioProcessingControlsAgentic.TranscriptionModeState.isInlineTranscriptionEnabled();
    }
};

console.log('[Transcription System Instructions] Initialized');
