window.EveAudioflixSoundLabNativeCapture = window.EveAudioflixSoundLabNativeCapture || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabNativeCapture;
    if (ns.ready) return;

    const PREBUFFER_MS = 360;
    const MAX_BACKLOG_MS = 1800;
    const MAX_CHUNK_AGE_MS = 1200;
    const CHANNELS = 2;

    function create(options) {
        const context = options.context;
        const source = options.source;
        let node = null;
        let sink = null;
        let moduleReady = null;
        let active = false;
        let priming = true;
        let pumping = false;
        let queue = [];
        let queuedMs = 0;
        let dropped = 0;
        let sent = 0;
        let startToken = 0;

        function clearQueue() {
            queue = [];
            queuedMs = 0;
            priming = true;
        }

        function detach() {
            if (node) {
                node.onaudioprocess = null;
                if (node.port) {
                    try { node.port.postMessage({ command: 'stop' }); } catch {}
                    node.port.onmessage = null;
                }
                try { node.disconnect(); } catch {}
                try { source.disconnect(node); } catch {}
            }
            try { sink?.disconnect(); } catch {}
            node = null;
            sink = null;
        }

        async function ensureWorklet() {
            if (!context?.audioWorklet?.addModule || !window.EveAudioflixCaptureProcessorSrc) return false;
            if (!moduleReady) {
                const url = `data:application/javascript,${encodeURIComponent(window.EveAudioflixCaptureProcessorSrc)}`;
                moduleReady = context.audioWorklet.addModule(url)
                    .then(() => true)
                    .catch(() => false);
            }
            return moduleReady;
        }

        function enqueue(block) {
            const copy = block instanceof Float32Array ? block : new Float32Array(block || 0);
            if (!copy.length) return;
            const durationMs = (copy.length / (context.sampleRate * CHANNELS)) * 1000;
            queue.push({ block: copy, queuedAt: Date.now(), durationMs });
            queuedMs += durationMs;
            while (queuedMs > MAX_BACKLOG_MS && queue.length > 1) {
                const removed = queue.shift();
                queuedMs -= removed.durationMs;
                dropped += 1;
            }
            if (priming && queuedMs < PREBUFFER_MS) return;
            priming = false;
            pump();
        }

        async function send(block) {
            const payload = window.EveAudioflixSoundLabCodec?.float32ToPcm16Base64?.(block, 1);
            if (!payload) return false;
            const ok = await window.EveAudioflixNative?.sendGeminiChunk?.(payload, {
                sampleRate: context.sampleRate,
                channels: CHANNELS
            });
            if (ok) sent += 1;
            return ok === true;
        }

        async function pump() {
            if (pumping) return;
            pumping = true;
            try {
                while (active && queue.length) {
                    const entry = queue.shift();
                    queuedMs -= entry.durationMs;
                    if (Date.now() - entry.queuedAt > MAX_CHUNK_AGE_MS) {
                        dropped += 1;
                        continue;
                    }
                    if (!(await send(entry.block))) dropped += 1;
                }
            } finally {
                pumping = false;
                if (active && queue.length) pump();
            }
        }

        function attachWorklet() {
            node = new AudioWorkletNode(context, 'audioflix-capture-processor', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2],
                processorOptions: { blockSize: 4096, channels: CHANNELS }
            });
            node.port.onmessage = (event) => enqueue(event.data);
            sink = context.createGain();
            sink.gain.value = 0;
            source.connect(node);
            node.connect(sink);
            sink.connect(context.destination);
        }

        function attachFallback() {
            if (typeof context.createScriptProcessor !== 'function') return false;
            node = context.createScriptProcessor(4096, 2, 2);
            sink = context.createGain();
            sink.gain.value = 0;
            node.onaudioprocess = (event) => {
                const input = event.inputBuffer;
                const left = input.getChannelData(0);
                const right = input.numberOfChannels > 1 ? input.getChannelData(1) : null;
                const stereo = new Float32Array(left.length * CHANNELS);
                for (let index = 0; index < left.length; index += 1) {
                    stereo[index * 2] = left[index];
                    stereo[index * 2 + 1] = right ? right[index] : left[index];
                }
                enqueue(stereo);
            };
            source.connect(node);
            node.connect(sink);
            sink.connect(context.destination);
            return true;
        }

        async function start() {
            if (active) return true;
            const token = ++startToken;
            clearQueue();
            dropped = 0;
            sent = 0;
            const warmed = await Promise.resolve(
                window.EveAudioflixNative?.warm?.(context.sampleRate)
            ).catch(() => false);
            if (warmed !== true || token !== startToken) return false;
            try {
                const workletReady = await ensureWorklet();
                if (token !== startToken) return false;
                if (workletReady) attachWorklet();
                else if (!attachFallback()) return false;
            } catch {
                detach();
                return false;
            }
            active = true;
            options.publish?.({ nativeProcessedRoute: true });
            return true;
        }

        async function stop(settings) {
            startToken += 1;
            const wasActive = active || !!node;
            if (!wasActive) return true;
            const drain = settings?.drain === true;
            active = false;
            const tail = drain ? queue.slice() : [];
            clearQueue();
            detach();
            if (drain) {
                for (const entry of tail) {
                    if (Date.now() - entry.queuedAt <= MAX_CHUNK_AGE_MS) await send(entry.block);
                }
            } else {
                await window.EveAudioflixNative?.stopStream?.().catch(() => {});
            }
            options.publish?.({ nativeProcessedRoute: false });
            return true;
        }

        return {
            start,
            stop,
            isActive: () => active,
            getStats: () => ({ active, priming, queuedMs, dropped, sent })
        };
    }

    Object.assign(ns, { ready: true, create });
})();
