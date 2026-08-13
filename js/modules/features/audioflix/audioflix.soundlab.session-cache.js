window.EveAudioflixSoundLabSessionCache = window.EveAudioflixSoundLabSessionCache || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabSessionCache;
    if (ns.ready) return;

    const CACHE_SECONDS = 3.1;
    const MAX_RETAINED_CHUNK_SECONDS = 4;
    const MAX_BRIDGE_SECONDS = 3;
    const HANDOFF_LEAD_SECONDS = 0.015;
    const CROSSFADE_SECONDS = 0.065;

    function create(options = {}) {
        // Recent decoded chunks stay in memory for this generation session only. Replaying real PCM
        // avoids both silence and the audible seam created by looping one 200 ms fragment.
        let reservoir = [];
        let reservoirSeconds = 0;
        let reservoirBytes = 0;
        let guard = null;
        let bridges = 0;
        let bridgedSeconds = 0;
        const entries = new Set();

        const getContext = () => options.context?.() || null;
        const getOutput = () => options.output?.() || null;
        const byteSize = (buffer) => (
            Math.max(1, Number(buffer?.length || 0))
            * Math.max(1, Number(buffer?.numberOfChannels || 1))
            * Float32Array.BYTES_PER_ELEMENT
        );

        function disconnect(entry) {
            entries.delete(entry);
            (entry?.sources || []).forEach((source) => {
                try { source.disconnect?.(); } catch {}
            });
            try { entry?.gainNode?.disconnect?.(); } catch {}
        }

        function stopEntry(entry, at) {
            if (!entry) return;
            entry.cancelled = true;
            (entry.sources || []).forEach((source) => {
                try { source.stop(at); } catch {}
            });
        }

        function setGain(param, at, value) {
            if (!param) return;
            try {
                param.cancelScheduledValues?.(at);
                param.setValueAtTime?.(value, at);
            } catch {}
        }

        function restorePrevious(entry, at) {
            const param = entry?.previousGain?.gain || entry?.previousGain;
            if (!param) return;
            try {
                if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(at);
                else param.cancelScheduledValues?.(at);
                param.setValueAtTime?.(1, at);
            } catch {}
        }

        function cancel(restore = true) {
            const entry = guard;
            guard = null;
            if (!entry) return false;
            const at = Number(getContext()?.currentTime || 0);
            if (restore && at < entry.tailAt) restorePrevious(entry, at);
            stopEntry(entry, at);
            disconnect(entry);
            return true;
        }

        function trimReservoir() {
            // Keep one partial leading chunk when needed. AudioBuffers are immutable references, so
            // the actual retained ceiling is CACHE_SECONDS plus one bounded source chunk.
            while (reservoir.length > 1
                && reservoirSeconds - Number(reservoir[0]?.duration || 0) >= CACHE_SECONDS) {
                const removed = reservoir.shift();
                reservoirSeconds -= Number(removed?.duration || 0);
                reservoirBytes -= byteSize(removed);
            }
        }

        function remember(buffer) {
            const duration = Number(buffer?.duration || 0);
            if (!duration || duration > MAX_RETAINED_CHUNK_SECONDS) return false;
            reservoir.push(buffer);
            reservoirSeconds += duration;
            reservoirBytes += byteSize(buffer);
            trimReservoir();
            return true;
        }

        function slicesForBridge(overlap) {
            const span = Math.min(reservoirSeconds, MAX_BRIDGE_SECONDS + overlap);
            if (!span || !reservoir.length) return [];
            let remaining = span;
            const slices = [];
            for (let index = reservoir.length - 1; index >= 0 && remaining > 0; index -= 1) {
                const buffer = reservoir[index];
                const duration = Number(buffer?.duration || 0);
                const take = Math.min(duration, remaining);
                slices.unshift({ buffer, offset: duration - take, duration: take });
                remaining -= take;
            }
            return slices;
        }

        function arm(tailAt, generation, previousGain) {
            const boundary = Number(tailAt || 0);
            if (guard && guard.generation === generation
                && Math.abs(guard.tailAt - boundary) < 0.0001) return true;
            cancel();
            const context = getContext();
            const output = getOutput();
            if (!context?.createBufferSource || !context?.createGain || !output || !boundary) return false;

            const overlap = Math.min(CROSSFADE_SECONDS, reservoirSeconds / 4);
            const slices = slicesForBridge(overlap);
            if (!slices.length) return false;
            const startAt = Math.max(Number(context.currentTime || 0), boundary - overlap);
            const gainNode = context.createGain();
            const gain = gainNode.gain;
            const sources = [];
            let cursor = startAt;

            gainNode.connect(output);
            setGain(gain, startAt, 0.0001);
            gain.linearRampToValueAtTime?.(1, boundary);
            const previousParam = previousGain?.gain || previousGain;
            if (previousParam) {
                setGain(previousParam, startAt, 1);
                previousParam.linearRampToValueAtTime?.(0.0001, boundary);
            }

            slices.forEach((slice) => {
                const source = context.createBufferSource();
                source.buffer = slice.buffer;
                source.connect(gainNode);
                source.start(cursor, slice.offset, slice.duration);
                cursor += slice.duration;
                sources.push(source);
            });

            const entry = {
                sources,
                gainNode,
                previousGain,
                startAt,
                tailAt: boundary,
                stopAt: cursor,
                generation,
                cancelled: false
            };
            guard = entry;
            entries.add(entry);
            sources.at(-1).onended = () => {
                const exhausted = guard === entry && !entry.cancelled;
                if (guard === entry) guard = null;
                disconnect(entry);
                if (exhausted) options.onExhausted?.(entry.generation);
            };
            return true;
        }

        function releaseAt(entry, handoffAt, incomingGain) {
            const context = getContext();
            const now = Number(context?.currentTime || 0);
            const fadeEnd = handoffAt + CROSSFADE_SECONDS;
            const guardGain = entry?.gainNode?.gain;
            const incoming = incomingGain?.gain || incomingGain;
            entry.cancelled = true;
            guard = null;
            try {
                if (guardGain?.cancelAndHoldAtTime) guardGain.cancelAndHoldAtTime(handoffAt);
                else setGain(guardGain, handoffAt, 1);
                guardGain?.linearRampToValueAtTime?.(0.0001, fadeEnd);
                setGain(incoming, handoffAt, 0.0001);
                incoming?.linearRampToValueAtTime?.(1, fadeEnd);
            } catch {}
            (entry.sources || []).forEach((source) => {
                try { source.stop(fadeEnd + 0.005); } catch {}
            });
            if (fadeEnd <= now) disconnect(entry);
        }

        function prepareHandoff(expectedStart, incomingGain) {
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
                if (now >= entry.startAt) releaseAt(entry, expected, incomingGain);
                else cancel(true);
                return { startAt: expected, bridgedSeconds: 0, covered: false, exhausted: false };
            }
            if (now < entry.stopAt - CROSSFADE_SECONDS) {
                const startAt = now + HANDOFF_LEAD_SECONDS;
                const coveredSeconds = Math.max(0, startAt - entry.tailAt);
                bridges += 1;
                bridgedSeconds += coveredSeconds;
                releaseAt(entry, startAt, incomingGain);
                return { startAt, bridgedSeconds: coveredSeconds, covered: true, exhausted: false };
            }
            cancel(false);
            return { startAt: 0, bridgedSeconds: 0, covered: false, exhausted: true };
        }

        function clear() {
            guard = null;
            const at = Number(getContext()?.currentTime || 0);
            entries.forEach((entry) => {
                stopEntry(entry, at);
                disconnect(entry);
            });
            entries.clear();
            reservoir = [];
            reservoirSeconds = 0;
            reservoirBytes = 0;
            bridges = 0;
            bridgedSeconds = 0;
        }

        function metrics() {
            const now = Number(getContext()?.currentTime || 0);
            const usable = Math.min(CACHE_SECONDS, reservoirSeconds);
            const channels = Math.max(1, Number(reservoir.at(-1)?.numberOfChannels || 1));
            const sampleRate = Math.max(1, Number(reservoir.at(-1)?.sampleRate || 48000));
            return {
                mode: 'memory-reservoir',
                tailSeconds: reservoirSeconds,
                usableTailSeconds: usable,
                bytes: Math.round(usable * sampleRate * channels * Float32Array.BYTES_PER_ELEMENT),
                retainedBytes: reservoirBytes,
                armed: !!guard,
                bridging: !!guard && now >= guard.tailAt,
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
            isBridging: () => !!guard && Number(getContext()?.currentTime || 0) >= guard.tailAt,
            metrics
        };
    }

    Object.assign(ns, {
        ready: true,
        create,
        constants: { CACHE_SECONDS, MAX_BRIDGE_SECONDS, MAX_RETAINED_CHUNK_SECONDS }
    });
})();
