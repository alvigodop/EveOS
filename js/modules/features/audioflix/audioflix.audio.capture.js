// Live PCM capture for the native EveOS route.
//
// Soundboard clips are short enough to decode up front (buffering is also what makes them
// mixable voices). A music track is not: decoding a whole song before the first sample is what
// put a lag between pressing play and hearing sound. This controller instead lets the media
// element play normally (instant start, seekable, progressive) while the LIVE signal is tapped
// from the Web Audio graph and streamed to the native bridge, with local speakers silenced so
// only the routed device hears it ("bypasser").
//
// The bridge mixes mono server-side (play_pcm keeps a single channel), so a stereo track is
// downmixed here rather than silently losing its right channel.
window.EveAudioflixAudioCapture = window.EveAudioflixAudioCapture || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixAudioCapture;
    if (ns.ready) return;

    // The bridge plays from a bounded queue drained by a device callback: an EMPTY queue emits
    // silence (audible cut-outs) and a FULL one drops its oldest chunk. Capture runs at exactly
    // 1x realtime, so sending each chunk the instant it appears leaves the queue hovering at empty
    // and any jitter/GC starves it. So: build a cushion before the first send, then pump chunks
    // strictly in order (never overlapping POSTs, which could also arrive out of sequence).
    const PREBUFFER_MS = 400;
    const MAX_BACKLOG_MS = 2000;

    ns.createController = function createController(deps) {
        const getWaveform = deps.getWaveform;
        const getPlayer = deps.getPlayer;
        const getVolume = deps.getVolume;
        let active = false;
        let pending = [];
        let pendingMs = 0;
        let rate = 0;
        let priming = true;
        let pumping = false;
        let dropped = 0;

        function reset() {
            pending = [];
            pendingMs = 0;
            priming = true;
        }

        function enqueue(mono) {
            pending.push(mono);
            pendingMs += (mono.length / rate) * 1000;
            // Bridge lagging realtime: bound the drift instead of growing delay without limit.
            while (pendingMs > MAX_BACKLOG_MS && pending.length > 1) {
                pendingMs -= (pending.shift().length / rate) * 1000;
                dropped += 1;
            }
        }

        async function send(chunk) {
            const payload = window.EveAudioflixAudioBridge?.encodePcm?.(chunk, 0, chunk.length, getVolume());
            if (!payload) return true;
            const detail = { sampleRate: rate, channels: 1 };
            let ok = await window.EveAudioflixNative?.sendGeminiChunk?.(payload, detail);
            // One retry: a single transient failure would otherwise punch a hole in the audio.
            if (ok !== true) ok = await window.EveAudioflixNative?.sendGeminiChunk?.(payload, detail);
            return ok === true;
        }

        async function pump() {
            if (pumping) return;
            pumping = true;
            try {
                while (active && pending.length) {
                    const chunk = pending.shift();
                    pendingMs -= (chunk.length / rate) * 1000;
                    if (!(await send(chunk))) dropped += 1;
                }
            } finally {
                pumping = false;
            }
        }

        let activePlayer = null;

        function onFrames(inputBuffer, sampleRate) {
            if (!active) return;
            rate = sampleRate;
            // Paused: drop the stale backlog and re-prime, so resuming rebuilds the cushion
            // instead of firing a burst of old audio at the device.
            const p = activePlayer || getPlayer();
            if (p?.paused) {
                if (!priming) reset();
                return;
            }
            const left = inputBuffer.getChannelData(0);
            let mono = left;
            if (inputBuffer.numberOfChannels > 1) {
                const right = inputBuffer.getChannelData(1);
                mono = new Float32Array(left.length);
                for (let index = 0; index < left.length; index += 1) mono[index] = (left[index] + right[index]) / 2;
            } else {
                mono = new Float32Array(left); // copy: the graph reuses its input buffer
            }
            enqueue(mono);
            if (priming && pendingMs < PREBUFFER_MS) return;
            priming = false;
            pump();
        }

        function stop() {
            if (!active) return false;
            active = false;
            activePlayer = null;
            reset();
            const waveform = getWaveform();
            waveform?.setFrameTap?.(null);
            waveform?.setSpeakerMuted?.(false);
            window.EveAudioflixNative?.stopStream?.().catch(() => {});
            return true;
        }

        // Async: the preferred tap is an AudioWorklet, whose module must be fetched once. Awaiting
        // it here means even the FIRST track gets the jank-immune audio-thread tap.
        async function start(player) {
            const waveform = getWaveform();
            if (!waveform?.setFrameTap) return false;
            reset();
            dropped = 0;
            activePlayer = player || null;
            if (player && typeof waveform.ensureGraph === 'function') {
                waveform.ensureGraph(player);
            }
            const tapRate = await waveform.setFrameTap(onFrames);
            if (!tapRate) return false;
            rate = tapRate;
            active = true;
            // Pre-open the device stream at this rate so the first chunks aren't clipped by a
            // cold WASAPI open (the same cause as the old first-reply cutout).
            window.EveAudioflixNative?.warm?.(rate)?.catch?.(() => {});
            waveform.setSpeakerMuted?.(true);
            return true;
        }

        return { start, stop, isActive: () => active, getStats: () => ({ rate, pendingMs, dropped, priming }) };
    };

    ns.ready = true;
})();
