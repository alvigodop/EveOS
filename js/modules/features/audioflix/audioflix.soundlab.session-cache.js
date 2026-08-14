window.EveAudioflixSoundLabSessionCache = window.EveAudioflixSoundLabSessionCache || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabSessionCache;
    if (ns.ready) return;

    const concealment = window.EveAudioflixSoundLabConcealment;
    if (!concealment?.ready) {
        throw new Error('Sonic Forge concealment must load before its session cache.');
    }
    const {
        matchedFade,
        similarityOffset,
        shapeGrain,
        incomingAlignmentOffset
    } = concealment;
    const {
        CROSSFADE_SECONDS,
        CONCEALMENT_WINDOW_SECONDS,
        GRAIN_SECONDS,
        MIN_GRAIN_SECONDS
    } = concealment.constants;

    const CACHE_SECONDS = 1.25;
    const MAX_RETAINED_CHUNK_SECONDS = 4;
    const MAX_BRIDGE_SECONDS = 2.6;
    const HANDOFF_LEAD_SECONDS = 0.015;

    function create(options = {}) {
        // Recent decoded chunks stay in memory for this generation session only. A dry boundary is
        // concealed with overlapping tail grains rather than replaying a recognizable music phrase.
        let reservoir = [];
        let reservoirSeconds = 0;
        let reservoirBytes = 0;
        let guard = null;
        let bridges = 0;
        let bridgedSeconds = 0;
        let alignedHandoffs = 0;
        let alignedSeconds = 0;
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
            (entry?.grainGains || []).forEach((gainNode) => {
                try { gainNode.disconnect?.(); } catch {}
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

        function selectGrainBuffer() {
            for (let index = reservoir.length - 1; index >= 0; index -= 1) {
                if (Number(reservoir[index]?.duration || 0) >= MIN_GRAIN_SECONDS) {
                    return reservoir[index];
                }
            }
            return null;
        }

        function arm(tailAt, generation, previousGain) {
            const boundary = Number(tailAt || 0);
            if (guard && guard.generation === generation
                && Math.abs(guard.tailAt - boundary) < 0.0001) return true;
            cancel();
            const context = getContext();
            const output = getOutput();
            if (!context?.createBufferSource || !context?.createGain || !output || !boundary) return false;

            const buffer = selectGrainBuffer();
            if (!buffer) return false;
            const grainDuration = Math.min(GRAIN_SECONDS, Number(buffer.duration || 0));
            const hop = Math.max(MIN_GRAIN_SECONDS / 2, grainDuration / 2);
            const overlap = Math.min(CROSSFADE_SECONDS, grainDuration / 3);
            const startAt = Math.max(Number(context.currentTime || 0), boundary - overlap);
            const bridgeEnd = boundary + MAX_BRIDGE_SECONDS;
            const gainNode = context.createGain();
            const gain = gainNode.gain;
            const sources = [];
            const grainGains = [];
            const grains = [];
            let cursor = startAt;
            let index = 0;
            let stopAt = startAt;
            let previousGrain = null;

            gainNode.connect(output);
            setGain(gain, startAt, 1);
            const previousParam = previousGain?.gain || previousGain;
            if (previousParam) {
                setGain(previousParam, startAt, 1);
                previousParam.linearRampToValueAtTime?.(0.0001, boundary);
            }

            while (cursor + (MIN_GRAIN_SECONDS / 2) < bridgeEnd) {
                const playDuration = Math.min(grainDuration, bridgeEnd - cursor);
                if (playDuration < MIN_GRAIN_SECONDS) break;
                const source = context.createBufferSource();
                const grainGain = context.createGain();
                try { grainGain.gain.value = 0.0001; } catch {}
                const naturalPeak = cursor + Math.min(hop, playDuration / 2);
                const isOpeningGrain = index === 0 && boundary > cursor;
                const peakAt = isOpeningGrain
                    ? Math.min(boundary, cursor + playDuration - 0.005)
                    : naturalPeak;
                const endAt = cursor + playDuration;
                const envelopeEnd = isOpeningGrain
                    ? Math.min(endAt, boundary + hop)
                    : endAt;
                const referenceOffset = previousGrain
                    ? previousGrain.offset + Math.max(0, cursor - previousGrain.startAt)
                    : Math.max(0, Number(buffer.duration || 0) - overlap);
                const matchDuration = previousGrain ? hop : overlap;
                const offset = similarityOffset(
                    buffer,
                    index,
                    grainDuration,
                    referenceOffset,
                    matchDuration
                );
                source.buffer = buffer;
                source.connect(grainGain);
                grainGain.connect(gainNode);
                shapeGrain(grainGain.gain, cursor, peakAt, envelopeEnd);
                source.start(cursor, offset, playDuration);
                sources.push(source);
                grainGains.push(grainGain);
                grains.push({
                    buffer,
                    offset,
                    startAt: cursor,
                    peakAt,
                    envelopeEnd,
                    endAt
                });
                stopAt = endAt;
                previousGrain = { offset, startAt: cursor };
                cursor = isOpeningGrain ? boundary : cursor + hop;
                index += 1;
            }
            if (!sources.length) {
                try { gainNode.disconnect?.(); } catch {}
                return false;
            }

            const entry = {
                sources,
                grainGains,
                grains,
                gainNode,
                previousGain,
                startAt,
                tailAt: boundary,
                stopAt,
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
                matchedFade(guardGain, handoffAt, fadeEnd, false);
                try { incoming.value = 0.0001; } catch {}
                setGain(incoming, handoffAt, 0.0001);
                matchedFade(incoming, handoffAt, fadeEnd, true);
            } catch {}
            (entry.sources || []).forEach((source) => {
                try { source.stop(fadeEnd + 0.005); } catch {}
            });
            if (fadeEnd <= now) disconnect(entry);
        }

        function prepareHandoff(expectedStart, incomingGain, incomingBuffer) {
            const context = getContext();
            const now = Number(context?.currentTime || 0);
            const expected = Number(expectedStart || 0);
            const entry = guard;
            if (!entry) {
                return {
                    startAt: expected > now ? expected : now + HANDOFF_LEAD_SECONDS,
                    bridgedSeconds: 0,
                    offsetSeconds: 0,
                    covered: false,
                    exhausted: false
                };
            }
            if (now < entry.tailAt) {
                if (now >= entry.startAt) releaseAt(entry, expected, incomingGain);
                else cancel(true);
                return {
                    startAt: expected,
                    bridgedSeconds: 0,
                    offsetSeconds: 0,
                    covered: false,
                    exhausted: false
                };
            }
            if (now < entry.stopAt - CROSSFADE_SECONDS) {
                const startAt = now + HANDOFF_LEAD_SECONDS;
                const coveredSeconds = Math.max(0, startAt - entry.tailAt);
                const offsetSeconds = incomingAlignmentOffset(entry, startAt, incomingBuffer);
                bridges += 1;
                bridgedSeconds += coveredSeconds;
                if (offsetSeconds > 0) {
                    alignedHandoffs += 1;
                    alignedSeconds += offsetSeconds;
                }
                options.onBridge?.(coveredSeconds, entry.generation);
                releaseAt(entry, startAt, incomingGain);
                return {
                    startAt,
                    bridgedSeconds: coveredSeconds,
                    offsetSeconds,
                    covered: true,
                    exhausted: false
                };
            }
            cancel(false);
            return {
                startAt: 0,
                bridgedSeconds: 0,
                offsetSeconds: 0,
                covered: false,
                exhausted: true
            };
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
            alignedHandoffs = 0;
            alignedSeconds = 0;
        }

        function metrics() {
            const now = Number(getContext()?.currentTime || 0);
            const usable = Math.min(CACHE_SECONDS, reservoirSeconds);
            const channels = Math.max(1, Number(reservoir.at(-1)?.numberOfChannels || 1));
            const sampleRate = Math.max(1, Number(reservoir.at(-1)?.sampleRate || 48000));
            return {
                mode: 'memory-concealment',
                tailSeconds: reservoirSeconds,
                usableTailSeconds: usable,
                concealmentWindowSeconds: Math.min(CONCEALMENT_WINDOW_SECONDS, usable),
                bytes: Math.round(usable * sampleRate * channels * Float32Array.BYTES_PER_ELEMENT),
                retainedBytes: reservoirBytes,
                armed: !!guard,
                bridging: !!guard && now >= guard.tailAt,
                activeSources: entries.size,
                remainingSeconds: guard ? Math.max(0, guard.stopAt - now) : 0,
                bridges,
                bridgedSeconds,
                alignedHandoffs,
                alignedSeconds
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
        constants: {
            CACHE_SECONDS,
            MAX_BRIDGE_SECONDS,
            MAX_RETAINED_CHUNK_SECONDS,
            CONCEALMENT_WINDOW_SECONDS,
            GRAIN_SECONDS
        }
    });
})();
