/**
 * audioWorkletInitializer.js
 * Handles initialization of the modern AudioWorklet-based audio context.
 */

window.AudioContextInitializer = window.AudioContextInitializer || {};

window.AudioContextInitializer.AudioWorkletHelper = {

    // Check if AudioWorklet is supported and environment requirements are met
    isSupported: function (state, helpers) {
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
