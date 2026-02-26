// PCM Processor Script UI Loader
// This module loads the HTML component containing the PCM processor audio worklet script

// Load PCM Processor Script HTML Component
// Load PCM Processor Script HTML Component
async function loadPcmProcessorScript() {
    try {
        console.log('[PCM Processor Script] Loading PCM Processor Script component...');

        // DISABLED: AudioWorkletProcessor should NOT be loaded in the main thread.
        // It must be loaded via audioContext.audioWorklet.addModule().
        // Loading it as a script tag causes ReferenceError: AudioWorkletProcessor is not defined.

        console.log('[PCM Processor Script] Skipping script injection (handled by AudioWorkletInitializer)');
        return Promise.resolve();

        /*
        // Programmatically create the script element
        // Equivalent to: <script src="client/pcm-processor.js"></script>
        const script = document.createElement('script');
        script.src = "client/pcm-processor.js";

        return new Promise((resolve, reject) => {
            script.onload = () => {
                console.log('[PCM Processor Script] Script loaded successfully: client/pcm-processor.js');
                resolve();
            };
            script.onerror = (error) => {
                console.error('[PCM Processor Script] Failed to load script: client/pcm-processor.js', error);
                reject(error);
            };
            document.head.appendChild(script);
        });
        */

    } catch (error) {
        console.error('[PCM Processor Script] Error loading component:', error);
        return Promise.reject(error);
    }
}

// Expose the function globally for use by the initialization system
window.loadPcmProcessorScript = loadPcmProcessorScript; 