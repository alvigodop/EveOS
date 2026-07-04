/**
 * audioWorkletInitializer.js
 * Handles initialization of the modern AudioWorklet-based audio context.
 */

window.AudioContextInitializer = window.AudioContextInitializer || {};

window.AudioContextInitializer.AudioWorkletHelper = {

    // Check if AudioWorklet is supported and environment requirements are met
    isSupported: function (state, helpers) {
        // The worklet plays raw 24kHz PCM samples 1:1 at the CONTEXT's rate — no resampling.
        // If the browser refused our 24kHz hint (some Bluetooth/exclusive-mode output devices
        // force 44.1/48kHz), worklet playback runs ~2x speed — heard as the reply racing
        // through itself ("sped through" corrupted audio). The buffer-source fallback stamps
        // buffers at 24kHz and lets Web Audio resample, so it stays correct at any context
        // rate — prefer it whenever the rate is off.
        if (state.audioInputContext && state.audioInputContext.sampleRate !== 24000) {
            console.warn(`AudioWorkletHelper: context is running at ${state.audioInputContext.sampleRate}Hz (24000Hz requested) — using the rate-safe fallback player instead of the worklet.`);
            return false;
        }
        return state.audioInputContext.audioWorklet &&
            (helpers.isSecureContext ? helpers.isSecureContext() : true) &&
            (helpers.isCreateObjectURLAvailable ? helpers.isCreateObjectURLAvailable() : true);
    },

    // Initialize the AudioWorklet
    initialize: async function (state, helpers) {
        console.log("AudioWorkletHelper: Initializing...");

        try {
            // Get processor code from window.AudioWorkletCode (defined in audioWorkletProcessor.js)
            if (!window.AudioWorkletCode || !window.AudioWorkletCode.getProcessorCode) {
                throw new Error("AudioWorkletProcessor code not found.");
            }

            const processorCode = window.AudioWorkletCode.getProcessorCode();

            // Safely create Blob URL
            // Load the processor file directly
            // This avoids "blob:null" errors in some environments/configurations
            const processorPath = 'client/pcm-processor.js';
            console.log("AudioWorkletHelper: Attempting to load module from:", processorPath);

            await state.audioInputContext.audioWorklet.addModule(processorPath);
            console.log("AudioWorkletHelper: Module loaded successfully");

            // Create worklet node
            state.workletNode = new AudioWorkletNode(state.audioInputContext, 'simple-audio-processor', {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [1]
            });

            // Connect to destination
            state.workletNode.connect(state.audioInputContext.destination);
            console.log("AudioWorkletHelper: Worklet connected to destination");

            // Flag that we're using worklet
            state.audioInputContext.usingWorklet = true;

            return true;


        } catch (workletError) {
            console.warn("AudioWorkletHelper: Initialization failed:", workletError);
            throw workletError;
        }
    }
};
