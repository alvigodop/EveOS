class SimpleAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(0);
        this.position = 0;
        this.playing = false;
        this.lastSeq = -1;
        this.isFinal = false;

        this.port.onmessage = (event) => {
            const msg = event.data;
            // Stop command - clear state
            if (msg && msg.command === 'stop') {
                console.log('Received stop command in worklet');
                this.buffer = new Float32Array(0);
                this.position = 0;
                this.playing = false;
                this.lastSeq = -1;
                this.isFinal = false;
                return;
            }

            // New audio payload with sequencing (preferred)
            if (msg && msg.type === 'audio' && msg.data instanceof Float32Array) {
                const seq = typeof msg.seq === 'number' ? msg.seq : -1;
                // console.log('Worklet received audio seq=', seq, 'len=', msg.data.length, 'lastSeq=', this.lastSeq); 

                // Detect gaps or out-of-order delivery
                if (seq !== -1) {
                    if (this.lastSeq !== -1 && seq > this.lastSeq + 1) {
                        console.warn('Worklet detected gap: lastSeq=', this.lastSeq, 'incomingSeq=', seq);
                        // Request missing sequences from the main thread
                        const missing = [];
                        for (let s = this.lastSeq + 1; s < seq; s++) missing.push(s);
                        if (missing.length > 0) {
                            try {
                                this.port.postMessage({ type: 'requestMissing', seq: missing });
                                console.log('Worklet requested missing seq:', missing);
                            } catch (e) {
                                console.warn('Worklet failed to request missing seq:', e);
                            }
                        }
                    }
                    if (seq <= this.lastSeq) {
                        console.warn('Worklet dropping stale packet seq=', seq, 'lastSeq=', this.lastSeq);
                        return;
                    }
                    this.lastSeq = seq;
                }

                const newData = msg.data;
                const newBuffer = new Float32Array(this.buffer.length + newData.length);
                newBuffer.set(this.buffer);
                newBuffer.set(newData, this.buffer.length);
                this.buffer = newBuffer;
                this.playing = true;
                if (msg.final) this.isFinal = true;
                return;
            }

            // Backwards-compatible: raw Float32Array
            if (msg instanceof Float32Array) {
                const newData = msg;
                const newBuffer = new Float32Array(this.buffer.length + newData.length);
                newBuffer.set(this.buffer);
                newBuffer.set(newData, this.buffer.length);
                this.buffer = newBuffer;
                this.playing = true;
                return;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channel = output[0];

        if (this.playing && this.buffer.length > 0) {
            const available = this.buffer.length - this.position;
            if (available <= 0) {
                // We've reached the end
                this.playing = false;
                return true;
            }

            // Calculate how many samples to copy
            const toCopy = Math.min(channel.length, available);

            // Copy data to output
            for (let i = 0; i < toCopy; i++) {
                channel[i] = this.buffer[this.position + i];
            }

            // Advance position
            this.position += toCopy;

            // If we didn't fill the buffer, fill with zeros
            if (toCopy < channel.length) {
                for (let i = toCopy; i < channel.length; i++) {
                    channel[i] = 0;
                }

                // Check if we're done
                if (this.position >= this.buffer.length) {
                    this.playing = false;
                }
            }
        } else {
            // Fill with zeros if not playing
            for (let i = 0; i < channel.length; i++) {
                channel[i] = 0;
            }
        }

        // Always continue processing
        return true;
    }
}

registerProcessor('simple-audio-processor', SimpleAudioProcessor);