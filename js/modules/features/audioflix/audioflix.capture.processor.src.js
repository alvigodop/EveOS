// AudioWorklet capture processor for the Audioflix native route — carried as SOURCE TEXT.
//
// Why a string instead of a plain .js file: addModule() has to fetch the module, and on a file://
// page Chrome refuses every URL we can offer it. Measured on file:// (tools/smoke/
// audioflix_capture_worklet_smoke.js pins this):
//
//     addModule('file:///.../processor.js')   -> AbortError
//     addModule(blob:  from that source)      -> AbortError   (the usual workaround; it does NOT
//                                                              help here, blob inherits a null origin)
//     addModule('data:application/javascript,...')  -> OK
//
// A data: URL is the only one that loads, and it needs the source in hand — which a file:// page
// cannot fetch. So the source lives here, in a classic script (those load fine from file://), and
// the loader builds a data: URL from it. That works identically on http, so there is no
// protocol-specific path at all.
//
// This matters well beyond tidiness: without it the capture tap falls back to a
// ScriptProcessorNode, which runs on the MAIN thread, so any UI work (a rerender, GC, a fetch
// settling) makes it deliver late or short frames — heard as the song hitching. A worklet runs on
// the audio thread and is immune.
//
// Defaults to mono for existing capture users. Callers may request interleaved stereo so a
// processed effects mix reaches the native bridge without losing its stereo field.
// Fixed-size blocks are transferred so no copy happens on the audio thread.
window.EveAudioflixCaptureProcessorSrc = String.raw`
class AudioflixCaptureProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const requested = Number(options && options.processorOptions && options.processorOptions.blockSize);
        const requestedChannels = Number(options && options.processorOptions && options.processorOptions.channels);
        this.blockSize = Math.max(256, Number.isFinite(requested) && requested > 0 ? requested : 4096);
        this.channels = requestedChannels === 2 ? 2 : 1;
        this.buffer = new Float32Array(this.blockSize * this.channels);
        this.filledFrames = 0;
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
            if (this.channels === 2) {
                const offset = this.filledFrames * 2;
                this.buffer[offset] = left[index];
                this.buffer[offset + 1] = right ? right[index] : left[index];
            } else {
                this.buffer[this.filledFrames] = right
                    ? (left[index] + right[index]) / 2
                    : left[index];
            }
            this.filledFrames += 1;
            if (this.filledFrames === this.blockSize) {
                const block = this.buffer;
                this.buffer = new Float32Array(this.blockSize * this.channels);
                this.filledFrames = 0;
                this.port.postMessage(block, [block.buffer]);
            }
        }
        return true;
    }
}

registerProcessor('audioflix-capture-processor', AudioflixCaptureProcessor);
`;
