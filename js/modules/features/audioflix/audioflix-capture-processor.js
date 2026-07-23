// AudioWorklet capture processor for the Audioflix native route.
//
// Loaded via audioContext.audioWorklet.addModule() (same pattern as the Gemini
// js/modules/gemini/client/pcm-processor.js), so it runs on the dedicated AUDIO thread. That is
// the whole point: a ScriptProcessorNode runs on the main thread, so any EveOS jank (render,
// GC, a fetch settling) makes it deliver late or short frames — heard as blips in an otherwise
// clean stream. A worklet is immune to that.
//
// Downmixes to mono (the native bridge mixes mono server-side) and posts fixed-size blocks,
// transferring the buffer so no copy happens on the audio thread.
class AudioflixCaptureProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const requested = Number(options && options.processorOptions && options.processorOptions.blockSize);
        this.blockSize = Math.max(256, Number.isFinite(requested) && requested > 0 ? requested : 4096);
        this.buffer = new Float32Array(this.blockSize);
        this.filled = 0;
        this.running = true;
        this.port.onmessage = (event) => {
            if (event && event.data && event.data.command === 'stop') this.running = false;
        };
    }

    process(inputs) {
        // Returning false permanently ends the node; only do that once told to stop.
        if (!this.running) return false;
        const input = inputs[0];
        if (!input || !input.length) return true;
        const left = input[0];
        if (!left) return true;
        const right = input.length > 1 ? input[1] : null;
        for (let index = 0; index < left.length; index += 1) {
            this.buffer[this.filled] = right ? (left[index] + right[index]) / 2 : left[index];
            this.filled += 1;
            if (this.filled === this.blockSize) {
                const block = this.buffer;
                this.buffer = new Float32Array(this.blockSize);
                this.filled = 0;
                this.port.postMessage(block, [block.buffer]);
            }
        }
        return true;
    }
}

registerProcessor('audioflix-capture-processor', AudioflixCaptureProcessor);
