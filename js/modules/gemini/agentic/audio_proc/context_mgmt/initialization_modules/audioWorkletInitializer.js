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

            // On file:// neither obvious route works, which is why this kept falling back to the
            // legacy player: addModule('js/.../pcm-processor.js') is a fetch from an opaque origin
            // and Chromium refuses it outright ("Cross origin requests are only supported for
            // protocol schemes: ... http, https"), while a blob: URL inherits the null origin and
            // fails as blob:null -- the attempt this code was originally written around. A data:
            // URL carries the source inline, so there is no fetch left to block. Same route
            // audioflix.audio.waveform.js already relies on for its capture worklet.
            //
            // The file path stays as the second try: over http:// it works, and it is the only
            // route if the inline source is ever unavailable. Both register the identical
            // 'simple-audio-processor', so whichever loads first is interchangeable.
            const moduleUrls = [];
            if (processorCode) {
                moduleUrls.push('data:application/javascript,' + encodeURIComponent(processorCode));
            }
            moduleUrls.push('js/modules/gemini/client/pcm-processor.js');

            let moduleLoaded = false;
            let lastModuleError = null;
            for (const url of moduleUrls) {
                try {
                    await state.audioInputContext.audioWorklet.addModule(url);
                    moduleLoaded = true;
                    console.log("AudioWorkletHelper: Module loaded via", url.slice(0, 32));
                    break;
                } catch (moduleError) {
                    lastModuleError = moduleError;
                }
            }
            if (!moduleLoaded) {
                throw lastModuleError || new Error("AudioWorklet module could not be loaded.");
            }

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
