/**
 * interimIngestHandler.js
 * Handles ingestion and playback of interim audio chunks.
 * Plays at reduced speed for clarity during streaming.
 */

window.AudioIngestCore = window.AudioIngestCore || {};

window.AudioIngestCore.InterimIngestHandler = {
    lastPacketTime: 0,
    activeSources: [],
    freshStartRequested: false,
    nextStartTime: 0,

    // Configuration constants for the jitter buffer
    INITIAL_HEADROOM: 0.15, // Reduced from 0.4s for snappier startup
    RESYNC_THRESHOLD: 5.0,  // Increased for better jitter tolerance
    IDLE_THRESHOLD: 10.0,   // Grace period before resetting audio timeline
    HEARTBEAT_TIMEOUT: 15000, // Persistence window (ms) to keep turn alive

    /**
     * Resets the scheduling clock to current time.
     * Should be called when starting a new stream of interim chunks.
     */
    reset: function (context) {
        if (context) {
            this.nextStartTime = context.currentTime;
            this.freshStartRequested = true;
            this.lastPacketTime = 0; // Clear persistence on explicit reset
            console.log("[InterimIngestHandler] Scheduling clock reset and fresh start flagged.");
        }
    },

    /**
     * Stops all active interim audio sources immediately.
     */
    stopAll: function () {
        console.log(`[InterimIngestHandler] Stopping ${this.activeSources.length} active sources`);
        this.activeSources.forEach(source => {
            try { source.stop(); } catch (e) { }
        });
        this.activeSources = [];
        this.nextStartTime = 0;
        this.freshStartRequested = false;
        this.lastPacketTime = 0;
    },

    /**
     * Checks if interim audio is still playing or scheduled to play.
     * Includes a 3-second stickiness period after the last packet to prevent 
     * final transcription packets from hijacking active turns during small gaps.
     */
    isStillStreaming: function (context) {
        if (!context) return false;

        const now = Date.now();
        const isHeartbeatActive = (this.lastPacketTime > 0 && (now - this.lastPacketTime < this.HEARTBEAT_TIMEOUT));

        // Check if we have active sources or if our next scheduled start time is in the future
        const hasFutureScheduled = this.nextStartTime > context.currentTime;
        const hasActiveSources = this.activeSources.length > 0;

        const stillStreaming = hasActiveSources || hasFutureScheduled || isHeartbeatActive;

        if (stillStreaming && !hasActiveSources && !hasFutureScheduled && isHeartbeatActive) {
            console.log("[InterimIngestHandler] State is 'Still Streaming' due to packet heartbeat persistence.");
        }

        return stillStreaming;
    },

    playInterimAudio: async function (base64AudioChunk, context) {
        this.lastPacketTime = Date.now(); // Record arrival for turn persistence
        const arrayBuffer = base64ToArrayBuffer(base64AudioChunk);
        try {
            if (typeof createAudioBufferFromPCM === 'function') {
                const audioBuffer = createAudioBufferFromPCM(arrayBuffer, context);
                const interimSource = context.createBufferSource();
                interimSource.buffer = audioBuffer;
                interimSource.playbackRate.value = 1.0;
                interimSource.connect(context.destination);

                // Determine if this is a fresh start (explicit flag OR long idle)
                const gap = context.currentTime - this.nextStartTime;
                const isFreshStart = this.freshStartRequested || (this.activeSources.length === 0 && gap > this.IDLE_THRESHOLD);

                if (isFreshStart) {
                    // Hardware Warm-up: Send a silent pulse immediately to wake up Bluetooth/Wireless
                    try {
                        const chirp = context.createBuffer(1, 1, 24000);
                        const chirpSource = context.createBufferSource();
                        chirpSource.buffer = chirp;
                        chirpSource.connect(context.destination);
                        chirpSource.start();
                    } catch (e) {
                        console.warn("[InterimIngestHandler] Warm-up chirp failed:", e);
                    }

                    // Schedule voice after headroom
                    this.nextStartTime = context.currentTime + this.INITIAL_HEADROOM;
                    this.freshStartRequested = false;
                    console.log(`[InterimIngestHandler] Fresh start warm-up: ${this.INITIAL_HEADROOM}s lead time.`);
                } else if (gap > this.RESYNC_THRESHOLD) {
                    // Significant gap (underrun) - resync to current time to avoid scheduling too far in the past
                    if (this.activeSources.length > 0) {
                        console.warn(`[InterimIngestHandler] Underrun detected (gap: ${gap.toFixed(3)}s). Resyncing clock.`);
                    }
                    this.nextStartTime = context.currentTime;
                }
                // Otherwise: if gap is small (< 2s), we keep the old nextStartTime.

                // Final safety: don't schedule too far in the past, but allow 
                // Web Audio to play late chunks immediately (startTime <= currentTime).
                const startTime = Math.max(this.nextStartTime, context.currentTime);
                // Extra logging to detect potential truncation/overlap issues
                console.log(`[InterimIngestHandler] Scheduling interim chunk. startTime=${startTime.toFixed(3)}, currentTime=${context.currentTime.toFixed(3)}, nextStartTime=${this.nextStartTime.toFixed(3)}, activeSources=${this.activeSources.length}`);
                console.log(`[InterimIngestHandler] AudioBuffer duration: ${audioBuffer.duration.toFixed(3)}s`);
                // If we're scheduling to start at or before currentTime, record a warning
                if (startTime <= context.currentTime) {
                    console.warn('[InterimIngestHandler] Scheduling startTime <= currentTime — chunk may play immediately and could overlap or truncate previous audio.');
                }
                interimSource.start(startTime);

                // Track this source
                this.activeSources.push(interimSource);
                interimSource.onended = () => {
                    // Remove from active sources when done
                    this.activeSources = this.activeSources.filter(s => s !== interimSource);
                    try {
                        console.log('[InterimIngestHandler] interimSource.onended fired; remaining activeSources:', this.activeSources.length);
                    } catch (e) { }
                };

                // Advance the clock based on the intended start time
                this.nextStartTime = startTime + audioBuffer.duration;
                console.log(`[InterimIngestHandler] nextStartTime updated to ${this.nextStartTime.toFixed(3)} (duration ${audioBuffer.duration.toFixed(3)}s)`);
            } else {
                console.warn("createAudioBufferFromPCM not available for interim playback");
            }
        } catch (error) {
            console.error("Error playing interim audio chunk:", error);
        }
    }
};

console.log("interimIngestHandler.js loaded.");
