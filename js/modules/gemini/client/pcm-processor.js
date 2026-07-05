class SimpleAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // ~5 minutes @ 24kHz, bounded — never reallocated.
        this.capacity = 24000 * 300;
        this.ring = new Float32Array(this.capacity);
        this.readIndex = 0;
        this.writeIndex = 0;
        this.available = 0;        // queued (unplayed) samples
        this.started = false;      // gate first play / rebuffer on the jitter cushion
        this.preroll = 4800;       // ~200ms @ 24kHz jitter buffer
        this.emptyQuanta = 0;      // consecutive silent render quanta while playing
        this.isFinal = false;

        this.port.onmessage = (event) => {
            const msg = event.data;

            // Stop command - clear state
            if (msg && msg.command === 'stop') {
                this.readIndex = 0;
                this.writeIndex = 0;
                this.available = 0;
                this.started = false;
                this.emptyQuanta = 0;
                this.isFinal = false;
                return;
            }

            // Audio payload — play every chunk in arrival order.
            if (msg && msg.type === 'audio' && msg.data instanceof Float32Array) {
                this._write(msg.data);
                if (msg.final) this.isFinal = true;
                return;
            }

            // Backwards-compatible: raw Float32Array
            if (msg instanceof Float32Array) {
                this._write(msg);
                return;
            }
        };
    }

    // Copy a chunk into the ring buffer. If the producer outruns playback, drop the
    // oldest queued samples so latency stays bounded instead of growing without end.
    _write(data) {
        let len = data.length;
        if (len === 0) return;

        // If incoming chunk exceeds capacity, keep only the most recent part
        if (len > this.capacity) {
            data = data.subarray(len - this.capacity);
            len = this.capacity;
        }

        if (this.available + len > this.capacity) {
            const drop = (this.available + len) - this.capacity;
            this.readIndex = (this.readIndex + drop) % this.capacity;
            this.available -= drop;
        }

        let w = this.writeIndex;
        const cap = this.capacity;
        for (let i = 0; i < len; i++) {
            this.ring[w] = data[i];
            w++;
            if (w === cap) w = 0;
        }
        this.writeIndex = w;
        this.available += len;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channel = output[0];
        const need = channel.length;

        // Rebuffer threshold: wait for preroll cushion if we underran
        if (!this.started && this.available >= this.preroll) {
            this.started = true;
            this.emptyQuanta = 0;
        }

        if (this.started && this.available > 0) {
            const toCopy = Math.min(need, this.available);
            const cap = this.capacity;
            let r = this.readIndex;
            for (let i = 0; i < toCopy; i++) {
                channel[i] = this.ring[r];
                r++;
                if (r === cap) r = 0;
            }
            this.readIndex = r;
            this.available -= toCopy;
            for (let i = toCopy; i < need; i++) channel[i] = 0;
            // A quantum that produced audio is NOT an underrun. (This counter used to increment
            // here on every SUCCESSFUL quantum, tripping the rebuffer gate every ~16ms — which
            // froze playback whenever fewer than preroll samples remained queued, wedging clip
            // tails and stuttering live streams.)
            this.emptyQuanta = 0;

            if (this.available === 0 && this.isFinal) {
                this.started = false;
                this.isFinal = false;
            }
        } else if (this.started) {
            // Started but nothing queued: a genuinely EMPTY quantum. Tolerate a momentary gap;
            // on a sustained underrun drop back to rebuffering so playback resumes smoothly on
            // the preroll cushion instead of stuttering quantum by quantum.
            for (let i = 0; i < need; i++) channel[i] = 0;
            this.emptyQuanta++;
            if (this.emptyQuanta > 2 || this.isFinal) {
                this.started = false;
                this.isFinal = false;
                this.emptyQuanta = 0;
            }
        } else {
            // Silent fill
            for (let i = 0; i < need; i++) channel[i] = 0;
        }

        return true;
    }
}

registerProcessor('simple-audio-processor', SimpleAudioProcessor);