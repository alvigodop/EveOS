window.EveAudioflixSoundLabSessionCache = window.EveAudioflixSoundLabSessionCache || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabSessionCache;
    if (ns.ready) return;

    const TAIL_SECONDS = 0.2;
    const MAX_RETAINED_CHUNK_SECONDS = 4;
    const MAX_BRIDGE_SECONDS = 0.45;
    const HANDOFF_LEAD_SECONDS = 0.015;
    const CROSSFADE_SECONDS = 0.03;
    const BOUNDARY_GAIN = 0.1;
    const PEAK_HOLD_GAIN = 0.65;
    const END_HOLD_GAIN = 0.16;

    function create(options = {}) {
        // One decoded chunk is held in RAM only; its final 200 ms conceals short delivery jitter.
        let tail = null;
        let tailStart = 0;
        let tailBytes = 0;
        let retainedBytes = 0;
        let guard = null;
        let bridges = 0;
        let bridgedSeconds = 0;
        const entries = new Set();

        const getContext = () => options.context?.() || null;
        const getOutput = () => options.output?.() || null;

        function disconnect(entry) {
            entries.delete(entry);
            try { entry?.source?.disconnect?.(); } catch {}
            try { entry?.gainNode?.disconnect?.(); } catch {}
        }

        function stopEntry(entry, at) {
            if (!entry) return;
            entry.cancelled = true;
            try { entry.source.stop(at); } catch {}
        }

        function cancel() {
            const entry = guard;
            guard = null;
            if (!entry) return false;
            const context = getContext();
            stopEntry(entry, Number(context?.currentTime || 0));
            disconnect(entry);
            return true;
        }

        function remember(buffer) {
            const duration = Number(buffer?.duration || 0);
            if (!duration || duration > MAX_RETAINED_CHUNK_SECONDS) {
                tail = null;
                tailStart = 0;
                tailBytes = 0;
                retainedBytes = 0;
                return false;
            }
            const sampleRate = Number(buffer.sampleRate || getContext()?.sampleRate || 48000);
            const channels = Math.max(1, Number(buffer.numberOfChannels || 1));
            const frames = Math.max(1, Number(buffer.length || Math.round(duration * sampleRate)));
            const tailFrames = Math.min(frames, Math.round(sampleRate * TAIL_SECONDS));
            tail = buffer;
            tailStart = Math.max(0, duration - (tailFrames / sampleRate));
            tailBytes = frames * channels * Float32Array.BYTES_PER_ELEMENT;
            retainedBytes = tailBytes;
            tailBytes = tailFrames * channels * Float32Array.BYTES_PER_ELEMENT;
            return true;
        }

        function arm(tailAt, generation) {
            if (guard && guard.generation === generation
                && Math.abs(guard.tailAt - Number(tailAt || 0)) < 0.0001) {
                return true;
            }
            cancel();
            const context = getContext();
            const output = getOutput();
            const boundary = Number(tailAt || 0);
            if (!context?.createBufferSource || !context?.createGain || !output || !tail || !boundary) {
                return false;
            }

            const source = context.createBufferSource();
            const gainNode = context.createGain();
            const gain = gainNode.gain;
            const overlap = Math.min(CROSSFADE_SECONDS, (tail.duration - tailStart) / 2);
            const startAt = Math.max(Number(context.currentTime || 0), boundary - overlap);
            const offset = Math.max(tailStart, tail.duration - Math.max(0, boundary - startAt));
            const stopAt = boundary + MAX_BRIDGE_SECONDS;
            source.buffer = tail;
            source.loop = true;
            source.loopStart = tailStart;
            source.loopEnd = tail.duration;
            source.connect(gainNode);
            gainNode.connect(output);
            gain.cancelScheduledValues(startAt);
            gain.setValueAtTime(0.0001, startAt);
            gain.linearRampToValueAtTime(BOUNDARY_GAIN, boundary);
            gain.linearRampToValueAtTime(PEAK_HOLD_GAIN, boundary + CROSSFADE_SECONDS);
            gain.linearRampToValueAtTime(END_HOLD_GAIN, stopAt);

            const entry = {
                source,
                gainNode,
                startAt,
                tailAt: boundary,
                stopAt,
                generation,
                cancelled: false
            };
            guard = entry;
            entries.add(entry);
            source.onended = () => {
                const exhausted = guard === entry && !entry.cancelled;
                if (guard === entry) guard = null;
                disconnect(entry);
                if (exhausted) options.onExhausted?.(entry.generation);
            };
            source.start(startAt, offset);
            source.stop(stopAt);
            return true;
        }

        function releaseAt(entry, handoffAt, fadeSeconds = CROSSFADE_SECONDS) {
            const context = getContext();
            const gain = entry?.gainNode?.gain;
            const now = Number(context?.currentTime || 0);
            const stopAt = handoffAt + Math.max(0.001, fadeSeconds);
            entry.cancelled = true;
            guard = null;
            if (gain?.cancelAndHoldAtTime) {
                gain.cancelAndHoldAtTime(now);
            } else if (gain) {
                gain.cancelScheduledValues(now);
                gain.setValueAtTime(PEAK_HOLD_GAIN, now);
            }
            gain?.linearRampToValueAtTime?.(0.0001, stopAt);
            try { entry.source.stop(stopAt + 0.005); } catch {}
        }

        function prepareHandoff(expectedStart) {
            const context = getContext();
            const now = Number(context?.currentTime || 0);
            const expected = Number(expectedStart || 0);
            const entry = guard;
            if (!entry) {
                return {
                    startAt: expected > now ? expected : now + HANDOFF_LEAD_SECONDS,
                    bridgedSeconds: 0,
                    covered: false,
                    exhausted: false
                };
            }
            if (now < entry.tailAt) {
                if (now >= entry.startAt) {
                    releaseAt(entry, now, Math.min(0.008, Math.max(0.001, expected - now)));
                }
                else cancel();
                return { startAt: expected, bridgedSeconds: 0, covered: false, exhausted: false };
            }
            if (now < entry.stopAt - CROSSFADE_SECONDS) {
                const startAt = now + HANDOFF_LEAD_SECONDS;
                const coveredSeconds = Math.max(0, startAt - entry.tailAt);
                bridges += 1;
                bridgedSeconds += coveredSeconds;
                releaseAt(entry, startAt);
                return { startAt, bridgedSeconds: coveredSeconds, covered: true, exhausted: false };
            }
            cancel();
            return {
                startAt: 0,
                bridgedSeconds: 0,
                covered: false,
                exhausted: true
            };
        }

        function clear() {
            guard = null;
            const context = getContext();
            const at = Number(context?.currentTime || 0);
            entries.forEach((entry) => {
                stopEntry(entry, at);
                disconnect(entry);
            });
            entries.clear();
            tail = null;
            tailStart = 0;
            tailBytes = 0;
            retainedBytes = 0;
            bridges = 0;
            bridgedSeconds = 0;
        }

        function metrics() {
            const context = getContext();
            const now = Number(context?.currentTime || 0);
            return {
                mode: 'memory-tail',
                tailSeconds: Number(tail?.duration || 0),
                usableTailSeconds: tail ? Math.max(0, tail.duration - tailStart) : 0,
                bytes: tailBytes,
                retainedBytes,
                armed: !!guard,
                activeSources: entries.size,
                remainingSeconds: guard ? Math.max(0, guard.stopAt - now) : 0,
                bridges,
                bridgedSeconds
            };
        }

        return {
            remember,
            arm,
            prepareHandoff,
            cancel,
            clear,
            isCovering: () => !!guard,
            metrics
        };
    }

    Object.assign(ns, {
        ready: true,
        create,
        constants: { TAIL_SECONDS, MAX_BRIDGE_SECONDS, MAX_RETAINED_CHUNK_SECONDS }
    });
})();
