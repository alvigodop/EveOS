/**
 * transcriptionModeState.js
 * Manages the state of the transcription mode (Separate Model vs Inline System Instruction)
 */

window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

window.AudioProcessingControlsAgentic.TranscriptionModeState = {
    // Transcription display modes
    WRAPPED: 'wrapped', // Extracted from box and placed as normal message
    RAW: 'raw',         // Left in thinking box with tags visible

    // Get current display mode from localStorage
    getCurrentMode: function () {
        const saved = localStorage.getItem('transcriptionDisplayMode');
        return saved || this.WRAPPED; // Default to wrapped (cleaned)
    },

    // Get current toggle state for prompt injection
    isInjectionEnabled: function () {
        const saved = localStorage.getItem('promptInjectionEnabled');
        return saved === 'true'; // Default to false
    },

    // Set toggle state
    setInjectionEnabled: function (enabled) {
        localStorage.setItem('promptInjectionEnabled', enabled.toString());
        console.log(`[Prompt Injection] Enabled: ${enabled}`);
    },

    // Get custom injection prompt
    getInjectionPrompt: function () {
        const defaultPrompt = `[RULE: ALWAYS wrap your final spoken response in <SPEECH-START> and <SPEECH-END> tags. DO NOT repeat your spoken response outside of these tags. Internal thoughts should be in **THOUGHTS** blocks. Example: **THOUGHTS** Greeting the user. <SPEECH-START>Hello! How can I help?</SPEECH-START>]`;
        const saved = localStorage.getItem('customInjectionPrompt');
        return saved || defaultPrompt;
    },

    // Set custom injection prompt
    setInjectionPrompt: function (prompt) {
        localStorage.setItem('customInjectionPrompt', prompt);
        console.log(`[Prompt Injection] Custom prompt saved.`);
    },

    // Set display mode
    setMode: function (mode) {
        if (mode === this.WRAPPED || mode === this.RAW) {
            localStorage.setItem('transcriptionDisplayMode', mode);
            console.log(`[Transcription Display] Changed to: ${mode}`);
            return true;
        }
        console.warn(`[Transcription Display] Invalid mode: ${mode}`);
        return false;
    },

    // Check if extraction (wrapping) is enabled
    isExtractionEnabled: function () {
        return this.getCurrentMode() === this.WRAPPED;
    },

    // Now linked to the toggle state
    isInlineTranscriptionEnabled: function () {
        return this.isInjectionEnabled();
    }
};

console.log('[Transcription Mode State] Initialized');
