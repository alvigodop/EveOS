/**
 * audioWorkletProcessor.js
 *
 * Contains the AudioWorklet processor code and registration logic.
 *
 * Playback uses a FIXED pre-allocated ring buffer (the audio render thread is a "no-allocation
 * zone") with a jitter buffer for smooth live streaming:
 *   - A ~200ms pre-roll raises the steady-state buffer floor, so normal network jitter rarely
 *     drains it to empty (fewer underruns => less choppiness).
 *   - A momentary drain is tolerated as a tiny gap, but a SUSTAINED underrun rebuffers (waits for
 *     the cushion again) so playback resumes cleanly instead of micro-stuttering chunk by chunk.
 *   - Every chunk is played in arrival order. There is no seq gap-drop: the old version discarded
 *     valid late/resent packets (seq <= lastSeq) and could carve holes into the audio. The Live
 *     transport is ordered and reliable, so in-order playback is correct.
 */

window.AudioWorkletCode = {
    getProcessorCode: function () {
        return `
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
                    if (!channel) return true;
                    const need = channel.length;

                    // Hold until a jitter cushion is queued — gates the first play and any rebuffer
                    // after a sustained underrun, so the start of speech is never clipped.
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

                        // Healthy if data remains; if we just drained, leave the counter for the
                        // underrun branch to decide whether it is momentary or sustained.
                        if (this.available > 0) this.emptyQuanta = 0;
                        if (this.available === 0 && this.isFinal) {
                            this.started = false;
                            this.isFinal = false;
                            this.emptyQuanta = 0;
                        }
                    } else {
                        for (let i = 0; i < need; i++) channel[i] = 0;
                        if (this.started) {
                            // Underrun: producer fell behind. Tolerate a momentary gap, but on a
                            // sustained underrun rebuffer so playback resumes smoothly rather than
                            // stuttering quantum by quantum.
                            this.emptyQuanta++;
                            if (this.emptyQuanta > 2 || this.isFinal) {
                                this.started = false;
                                this.isFinal = false;
                                this.emptyQuanta = 0;
                            }
                        }
                    }

                    // Always continue processing
                    return true;
                }
            }

            registerProcessor('simple-audio-processor', SimpleAudioProcessor);
        `;
    }
};
