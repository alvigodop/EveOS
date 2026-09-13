/**
 * interimIngestHandler.js
 * Smooth, monotonic playback for Gemini Live PCM chunks.
 */

window.AudioIngestCore = window.AudioIngestCore || {};

window.AudioIngestCore.InterimIngestHandler = {
    lastPacketTime: 0,
    activeSources: [],
    freshStartRequested: false,
    nextStartTime: 0,

    // Gemini Live audio arrives over the network. Keep a small jitter cushion so a
    // delayed packet does not force every following chunk to start at the live edge.
    INITIAL_HEADROOM: 0.15,
    REBUFFER_THRESHOLD: 0.025,
    IDLE_THRESHOLD: 0.35,
    HEARTBEAT_TIMEOUT: 15000,

    diagnostics: {
        chunks: 0,
        underflows: 0,
        rebufferEvents: 0,
        hardStops: 0,
        maxLeadSec: 0,
        lastLeadSec: 0,
        lastArrivalGapMs: 0,
        maxArrivalGapMs: 0,
        lastPacketAt: 0,
        lastRebufferReason: ''
    },

    reset: function (context) {
        if (context) {
            this.nextStartTime = context.currentTime;
            this.freshStartRequested = true;
            this.lastPacketTime = 0;
        }
    },

    /** Hard cancellation is reserved for explicit stop/barge-in. */
    stopAll: function (reason = 'manual') {
        this.activeSources.forEach(source => {
            try { source.stop(); } catch (e) { }
        });
        this.activeSources = [];
        this.nextStartTime = 0;
        this.freshStartRequested = false;
        this.lastPacketTime = 0;
        this.diagnostics.hardStops += 1;
        if (reason) this.diagnostics.lastStopReason = String(reason);
    },

    isStillStreaming: function (context) {
        if (!context) return false;
        const now = Date.now();
        const isHeartbeatActive = this.lastPacketTime > 0
            && (now - this.lastPacketTime < this.HEARTBEAT_TIMEOUT);
        return this.activeSources.length > 0
            || this.nextStartTime > context.currentTime
            || isHeartbeatActive;
    },

    getDiagnostics: function () {
        const context = window.audioInputContext;
        const lead = context ? Math.max(0, this.nextStartTime - context.currentTime) : 0;
        return {
            available: true,
            ...this.diagnostics,
            activeSources: this.activeSources.length,
            queueLeadSec: Number(lead.toFixed(3)),
            initialHeadroomSec: this.INITIAL_HEADROOM,
            rebufferThresholdSec: this.REBUFFER_THRESHOLD,
            contextState: context?.state || 'unavailable',
            outputSampleRate: Number(context?.sampleRate || 0) || null
        };
    },

    playInterimAudio: async function (base64AudioChunk, context) {
        const arrivalNow = Date.now();
        let arrivalGapMs = 0;
        if (this.diagnostics.lastPacketAt) {
            arrivalGapMs = arrivalNow - this.diagnostics.lastPacketAt;
            this.diagnostics.lastArrivalGapMs = arrivalGapMs;
            this.diagnostics.maxArrivalGapMs = Math.max(this.diagnostics.maxArrivalGapMs, arrivalGapMs);
        }
        this.diagnostics.lastPacketAt = arrivalNow;
        this.diagnostics.chunks += 1;
        this.lastPacketTime = arrivalNow;

        const arrayBuffer = base64ToArrayBuffer(base64AudioChunk);
        try {
            if (typeof createAudioBufferFromPCM !== 'function') {
                console.warn('createAudioBufferFromPCM not available for interim playback');
                return;
            }

            if (context?.state === 'suspended' && typeof context.resume === 'function') {
                try { await context.resume(); } catch (e) { /* user gesture policy may still own resume */ }
            }

            const audioBuffer = createAudioBufferFromPCM(arrayBuffer, context);
            const interimSource = context.createBufferSource();
            interimSource.buffer = audioBuffer;
            interimSource.playbackRate.value = 1.0;
            interimSource.connect(context.destination);

            const now = context.currentTime;
            const hasTimeline = Number.isFinite(this.nextStartTime) && this.nextStartTime > 0;
            const missedBy = hasTimeline ? now - this.nextStartTime : Number.POSITIVE_INFINITY;
            const idleArrival = arrivalGapMs > (this.IDLE_THRESHOLD * 1000)
                && this.activeSources.length === 0;
            const needsRebuffer = this.freshStartRequested
                || !hasTimeline
                || missedBy > this.REBUFFER_THRESHOLD
                || idleArrival;

            if (needsRebuffer) {
                let reason = 'fresh-start';
                if (!hasTimeline) reason = 'first-chunk';
                else if (missedBy > this.REBUFFER_THRESHOLD) reason = 'underflow';
                else if (idleArrival) reason = 'idle-resume';

                if (reason === 'underflow') this.diagnostics.underflows += 1;
                this.diagnostics.rebufferEvents += 1;
                this.diagnostics.lastRebufferReason = reason;

                try {
                    // Prime WebAudio with a silent one-frame source. This is best-effort and
                    // avoids the first real PCM source paying device wake-up cost on some hosts.
                    const chirp = context.createBuffer(1, 1, 24000);
                    const chirpSource = context.createBufferSource();
                    chirpSource.buffer = chirp;
                    chirpSource.connect(context.destination);
                    chirpSource.start();
                } catch (e) { /* warm-up is best effort */ }

                this.nextStartTime = now + this.INITIAL_HEADROOM;
                this.freshStartRequested = false;
            }

            const startTime = Math.max(this.nextStartTime, context.currentTime);
            interimSource._eveStartTime = startTime;
            interimSource._eveEndTime = startTime + audioBuffer.duration;
            interimSource.start(startTime);

            this.activeSources.push(interimSource);
            interimSource.onended = () => {
                this.activeSources = this.activeSources.filter(s => s !== interimSource);
            };

            this.nextStartTime = interimSource._eveEndTime;
            const scheduledLead = Math.max(0, this.nextStartTime - context.currentTime);
            this.diagnostics.lastLeadSec = Number(scheduledLead.toFixed(3));
            this.diagnostics.maxLeadSec = Math.max(this.diagnostics.maxLeadSec, scheduledLead);
        } catch (error) {
            console.error('Error playing interim audio chunk:', error);
        }
    }
};

console.log('interimIngestHandler.js loaded.');
