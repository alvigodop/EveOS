/**
 * ingestCoordinator.js
 * Coordinators the ingestion of audio chunks for playback.
 * Orchestrates Sequential, Interim, Worklet, and Error Recovery handlers.
 */

window.AudioIngestCore = window.AudioIngestCore || {};

// Centralized ingestion queue to prevent race conditions in scheduling
let ingestionQueue = Promise.resolve();

// --- Live waveform driver (routing-agnostic) ---
// Fed from ensureAudioPlayerUI (audioPlayerUI.js) for EVERY incoming chunk — that runs before any of
// handleAudioMessage's early returns (processing-disabled, interim-disabled, native/CABLE suppress),
// so the bars animate as the audio arrives no matter where the sound is actually routed. The caller
// hands us the exact player container it just ensured; we also keep a newestPlayer() fallback in case
// that element detaches. A rAF loop eases the bars toward each chunk's amplitude profile and decays
// back to idle once chunks stop arriving.
window.EveLiveWaveform = window.EveLiveWaveform || (function () {
    const BARS = 16;
    // The audio is heard ~one jitter buffer behind ingest, so hold each chunk's profile this long
    // before showing it — keeps the bars in step with the sound instead of running ahead. NOTE the
    // bars then EASE toward the chunk (the loop below), and that rise adds ~80-100ms on its own, so
    // the real perceived offset is roughly syncDelayMs + ~90ms. Default is tuned for the browser
    // worklet's ~200ms pre-roll; the CABLE/native bridge has its own latency. Tune it live without
    // a reload via  window.EveLiveWaveform.setSyncDelay(ms)  — lower = bars earlier, higher = later.
    let syncDelayMs = 120;
    let target = new Array(BARS).fill(0.06);
    let display = new Array(BARS).fill(0.06);
    let lastFeedAt = 0;
    let raf = null;
    let activeContainer = null;   // the player the caller bound us to for the current stream

    function newestPlayer() {
        const players = document.querySelectorAll('.audio-player-container');
        for (let i = players.length - 1; i >= 0; i--) {
            // Skip a player that's replaying — its own analyser drives it then.
            if (typeof players[i]._renderWaveBars === 'function' && !players[i].isPlaying) return players[i];
        }
        return null;
    }

    // Prefer the explicitly-bound container; fall back to the newest idle player if it's gone or busy.
    function resolveContainer() {
        if (activeContainer && document.body.contains(activeContainer) &&
            !activeContainer.isPlaying && typeof activeContainer._renderWaveBars === 'function') {
            return activeContainer;
        }
        return newestPlayer();
    }

    function ensureLoop() {
        if (raf) return;
        const loop = function () {
            const idle = (performance.now() - lastFeedAt) > 350;
            let settled = true;
            for (let b = 0; b < BARS; b++) {
                const goal = idle ? 0.06 : target[b];
                display[b] += (goal - display[b]) * 0.35;       // smooth ease toward the goal
                if (Math.abs(display[b] - 0.06) > 0.02) settled = false;
            }
            const container = resolveContainer();
            if (container) container._renderWaveBars(display.slice());
            if (idle && settled) { raf = null; return; }         // stop once back at idle
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
    }

    // Build an amplitude profile (RMS per segment) from a base64 int16 LE PCM chunk and drive the
    // given container's bars. `container` is the player ensureAudioPlayerUI just created/updated.
    function feedFromPcm(base64Chunk, container) {
        try {
            if (!base64Chunk) return;
            const bin = atob(base64Chunk);
            const sampleCount = bin.length >> 1;
            if (sampleCount < BARS) return;
            const seg = Math.floor(sampleCount / BARS);
            const next = new Array(BARS).fill(0);
            for (let b = 0; b < BARS; b++) {
                let sum = 0;
                const start = b * seg;
                for (let i = 0; i < seg; i++) {
                    const idx = (start + i) * 2;
                    let s = (bin.charCodeAt(idx) | (bin.charCodeAt(idx + 1) << 8));
                    if (s >= 32768) s -= 65536;
                    const f = s / 32768;
                    sum += f * f;
                }
                next[b] = Math.min(1, Math.sqrt(sum / seg) * 3.2);  // RMS, scaled for visibility
            }
            setTimeout(function () {
                target = next;
                lastFeedAt = performance.now();
                if (container) activeContainer = container;
                ensureLoop();
            }, syncDelayMs);
        } catch (e) { /* visualizer is optional */ }
    }

    return {
        feedFromPcm,
        // Live tuning knob for the audio/visual offset (see syncDelayMs note above).
        setSyncDelay: function (ms) { syncDelayMs = Math.max(0, Number(ms) || 0); return syncDelayMs; },
        getSyncDelay: function () { return syncDelayMs; }
    };
})();

async function injestAudioChuckToPlay(base64AudioChunk, isFinalAudio = true) {
    // Guard: Ignore null or undefined chunks
    if (!base64AudioChunk) {
        console.warn("[ingestCoordinator] Received null/undefined audio chunk, skipping.");
        return Promise.resolve();
    }

    // Wrap the entire execution in a serial queue
    return new Promise((resolve, reject) => {
        ingestionQueue = ingestionQueue.then(async () => {
            try {
                await _processInjest(base64AudioChunk, isFinalAudio);
                resolve();
            } catch (err) {
                console.error("Queue processing error:", err);
                // We resolve even on error to prevent deadlocking the promise chain
                resolve();
            }
        }).catch(err => {
            console.error("Fatal queue error:", err);
            resolve();
        });
    });
}

/**
 * Internal ingestion logic (now run sequentially via queue)
 */
async function _processInjest(base64AudioChunk, isFinalAudio = true) {
    // If master audio processing toggle is off, skip playback
    if (!playProcessedAudio) {
        console.log("Master audio toggle is off: skipping audio chunk ingestion");
        return;
    }

    const SequentialHandler = window.AudioIngestCore.SequentialIngestHandler;
    const InterimHandler = window.AudioIngestCore.InterimIngestHandler;
    const WorkletHandler = window.AudioIngestCore.WorkletIngestHandler;
    const ErrorHandler = window.AudioIngestCore.ErrorRecoveryHandler;

    try {
        if (isFinalAudio) {
            console.log("Processing final audio chunk, length:", base64AudioChunk.length);
            displayMessage("System Message: Processing audio data...", true);
        }

        // 1. Initialize or Resume Audio Context (Optimized hot-path)
        if (!window.audioInputContext) {
            await initializeAudioContext();
            if (!window.audioInputContext) throw new Error("Failed to initialize audio context");
        }
        if (window.audioInputContext.state === "suspended") {
            console.log("Resuming suspended audio context");
            try { await window.audioInputContext.resume(); } catch(e) { console.warn('audioContext resume failed', e); }
        }
        console.log('[ingestCoordinator] audioInputContext currentTime=', window.audioInputContext ? window.audioInputContext.currentTime : 'NO_CTX');

        // 2. Handle Interim Audio (Synchronous scheduling, MUST await to lock timeline)
        if (!isFinalAudio) {
            if (InterimHandler) {
                // We MUST await here to ensure the internal scheduling clock 
                // is updated before the next chunk in the queue is processed.
                await InterimHandler.playInterimAudio(base64AudioChunk, window.audioInputContext);
            } else {
                console.warn("InterimIngestHandler missing");
            }
            return;
        }

        // 3. Handle Final Audio - Turn Handoff Logic
        const wasStreaming = InterimHandler && typeof InterimHandler.isStillStreaming === 'function' && InterimHandler.isStillStreaming(window.audioInputContext);

        if (wasStreaming) {
            console.log("Turn handoff: detect active interim stream. Bypassing redundant final auto-play to prevent double-play/cutoff.");

            // Mark for fresh start on NEXT turn, but don't reset now
            if (InterimHandler && typeof InterimHandler.reset === 'function') {
                // We don't want to reset the timeline yet as it's still streaming.
            }

            // Archive final audio to sequential handler which will ensure a valid container
            if (SequentialHandler && sequentialAudioPlay) {
                try {
                    await SequentialHandler.handleSequentialIngest(base64AudioChunk, false);
                    console.log("[TurnHandoff] Delegated final audio to SequentialIngestHandler for archival/playback.");
                } catch (e) {
                    console.error("[TurnHandoff] Error delegating to SequentialIngestHandler:", e);
                }
                return;
            }

            // sequentialAudioPlay is disabled and the interim stream ALREADY SPOKE this reply.
            // Falling through here used to reset the interim clock mid-stream, stop the live
            // speech, and replay the whole clip from zero via the worklet — heard as the reply
            // cutting off and racing through itself ("sped through / corrupted"). The final
            // audio_data is not lost: ensureAudioPlayerUI already archived it on the message
            // player for replay. So: leave the live stream to finish naturally and do nothing.
            console.log("[TurnHandoff] sequentialAudioPlay disabled — interim already played this turn; final audio archived to the message player only.");
            return;
        }

        // NO TURN HANDOFF: This is a fresh non-streamed response or a manual completion
        // Reset interim handler for clean start next time
        if (InterimHandler && typeof InterimHandler.reset === 'function') {
            InterimHandler.reset(window.audioInputContext);
        }

        // Standard auto-play logic for non-streamed responses
        if (SequentialHandler && sequentialAudioPlay && autoAudioPlay) {
            console.log("Final response received: sequential mode active - stopping interim and delegating to SequentialIngestHandler");

            // CRITICAL: Stop the interim stream before starting high-quality sequential playback
            if (typeof stopAllAudioPlayback === 'function') {
                stopAllAudioPlayback();
                // Wait briefly for interim sources/worklet to stop to avoid overlap
                await new Promise(r => setTimeout(r, 100));
                if (InterimHandler) {
                    const startWait = Date.now();
                    while (InterimHandler.activeSources && InterimHandler.activeSources.length > 0 && Date.now() - startWait < 200) {
                        await new Promise(r => setTimeout(r, 10));
                    }
                }
            }

            await SequentialHandler.handleSequentialIngest(base64AudioChunk, false);
            return;
        }

        // 4. Handle Final Audio (Fallback Path)
        if (typeof stopAllAudioPlayback === 'function') {
            stopAllAudioPlayback();
            // Wait briefly for interim sources/worklet to stop to avoid overlap
            await new Promise(r => setTimeout(r, 100));
            if (InterimHandler) {
                const startWait = Date.now();
                while (InterimHandler.activeSources && InterimHandler.activeSources.length > 0 && Date.now() - startWait < 200) {
                    await new Promise(r => setTimeout(r, 10));
                }
            }
        }

        // Re-check context existence/state after potential resets
        if (!window.audioInputContext) {
            await initializeAudioContext();
            if (!window.audioInputContext) throw new Error("Failed to initialize audio context");
        }
        if (window.audioInputContext.state === "suspended") {
            await window.audioInputContext.resume();
        }

        const arrayBuffer = base64ToArrayBuffer(base64AudioChunk);
        console.log("Converted to array buffer, size:", arrayBuffer.byteLength);

        // 5. Playback Strategy Selection (Worklet vs Fallback)
        if (window.audioInputContext.usingWorklet && workletNode && WorkletHandler) {
            await WorkletHandler.playViaWorklet(arrayBuffer, window.audioInputContext);
        } else if (window.audioInputContext.usingFallback) {
            // Fallback handled via global function for now or could be modularized too, 
            // but plan said 'playViaWorklet' handles worklet logic.
            // We'll keep the direct call to the existing fallback or error if missing.
            if (typeof playAudioWithFallbackMethod === 'function') {
                playAudioWithFallbackMethod(arrayBuffer);
            } else {
                throw new Error("playAudioWithFallbackMethod not available");
            }
        } else {
            throw new Error("No valid audio playback method available");
        }

        displayMessage("System Message: Audio playback started", true);

    } catch (error) {
        console.error("Error processing audio chunk:", error);
        if (ErrorHandler) {
            await ErrorHandler.handleIngestError(error, base64AudioChunk);
        } else {
            // Basic fallback error display if handler missing
            displayMessage("System Message: Error playing audio response - " + error.message, true);
        }
    }
}

// Expose globally
window.injestAudioChuckToPlay = injestAudioChuckToPlay;

console.log("ingestCoordinator.js loaded.");
