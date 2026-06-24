/**
 * audioWorkletProcessor.js
 *
 * Contains the AudioWorklet processor code and registration logic.
 *
 * Playback uses a FIXED pre-allocated ring buffer. The audio render thread is a
 * "no-allocation zone": the previous version reallocated and copied the entire
 * audio history on every incoming chunk and never freed already-played samples,
 * so over a long session the per-chunk copy grew O(n), the worklet missed its
 * render deadline, and playback dropped out / degraded. A bounded ring buffer
 * keeps memory and per-chunk work constant, and a small jitter pre-roll stops the
 * first reply from cutting out before enough audio is queued.
 */

window.AudioWorkletCode = {
    getProcessorCode: function () {
        return `
            class SimpleAudioProcessor extends AudioWorkletProcessor {
                constructor() {
                    super();
                    // ~16s @ 24kHz, bounded — never reallocated.
                    this.capacity = 24000 * 16;
                    this.ring = new Float32Array(this.capacity);
                    this.readIndex = 0;
                    this.writeIndex = 0;
                    this.available = 0;        // queued (unplayed) samples
                    this.started = false;      // gate FIRST play on a small jitter pre-roll
                    this.preroll = 2400;       // ~100ms @ 24kHz -> no first-reply cut-out
                    this.lastSeq = -1;
                    this.isFinal = false;

                    this.port.onmessage = (event) => {
                        const msg = event.data;

                        // Stop command - clear state
                        if (msg && msg.command === 'stop') {
                            this.readIndex = 0;
                            this.writeIndex = 0;
                            this.available = 0;
                            this.started = false;
                            this.lastSeq = -1;
                            this.isFinal = false;
                            return;
                        }

                        // New audio payload with sequencing (preferred)
                        if (msg && msg.type === 'audio' && msg.data instanceof Float32Array) {
                            const seq = typeof msg.seq === 'number' ? msg.seq : -1;

                            // Detect gaps or out-of-order delivery
                            if (seq !== -1) {
                                if (this.lastSeq !== -1 && seq > this.lastSeq + 1) {
                                    const missing = [];
                                    for (let s = this.lastSeq + 1; s < seq; s++) missing.push(s);
                                    if (missing.length > 0) {
                                        try {
                                            this.port.postMessage({ type: 'requestMissing', seq: missing });
                                        } catch (e) {
                                            // best-effort gap recovery
                                        }
                                    }
                                }
                                if (seq <= this.lastSeq) {
                                    return; // stale / duplicate packet
                                }
                                this.lastSeq = seq;
                            }

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
                    const len = data.length;
                    if (len === 0) return;

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

                    if (this.available > 0) this.playing = true;
                }

                process(inputs, outputs, parameters) {
                    const output = outputs[0];
                    const channel = output[0];
                    if (!channel) return true;
                    const need = channel.length;

                    // Hold the very first samples until a small pre-roll is buffered so the start
                    // of a reply is not clipped by a cold/underrun start.
                    if (!this.started && this.available >= this.preroll) this.started = true;

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

                        // Underrun within a render quantum -> brief silence, resume when more
                        // data arrives (started stays true so there is no choppy re-buffer).
                        for (let i = toCopy; i < need; i++) channel[i] = 0;

                        if (this.available === 0 && this.isFinal) {
                            this.started = false;
                            this.isFinal = false;
                        }
                    } else {
                        for (let i = 0; i < need; i++) channel[i] = 0;
                    }

                    // Always continue processing
                    return true;
                }
            }

            registerProcessor('simple-audio-processor', SimpleAudioProcessor);
        `;
    }
};
