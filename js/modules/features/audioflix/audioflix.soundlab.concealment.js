window.EveAudioflixSoundLabConcealment = window.EveAudioflixSoundLabConcealment || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabConcealment;
    if (ns.ready) return;

    const CROSSFADE_SECONDS = 0.018;
    const CONCEALMENT_WINDOW_SECONDS = 0.72;
    const GRAIN_SECONDS = 0.18;
    const MIN_GRAIN_SECONDS = 0.05;
    const GOLDEN_RATIO_FRACTION = 0.618033988749895;
    const MATCH_SECONDS = 0.012;
    const SEARCH_STEP_SECONDS = 0.002;
    const HANDOFF_MATCH_SECONDS = 0.008;
    const MAX_HANDOFF_SKIP_SECONDS = 0.015;
    const FADE_CURVE_STEPS = 33;

    function fadeCurve(rising) {
        return Float32Array.from({ length: FADE_CURVE_STEPS }, (_, index) => {
            const angle = (index / (FADE_CURVE_STEPS - 1)) * Math.PI / 2;
            const incoming = Math.sin(angle);
            const outgoing = Math.cos(angle);
            const value = rising ? incoming : outgoing;
            return Math.max(0.0001, value / Math.max(0.0001, incoming + outgoing));
        });
    }

    const PHASE_MATCHED_IN = fadeCurve(true);
    const PHASE_MATCHED_OUT = fadeCurve(false);

    function matchedFade(param, startAt, endAt, rising) {
        if (!param || endAt <= startAt) return;
        if (typeof param.setValueCurveAtTime === 'function') {
            try {
                param.setValueCurveAtTime(
                    rising ? PHASE_MATCHED_IN : PHASE_MATCHED_OUT,
                    startAt,
                    endAt - startAt
                );
                return;
            } catch {}
        }
        param.linearRampToValueAtTime?.(rising ? 1 : 0.0001, endAt);
    }

    function grainOffset(buffer, index, grainDuration) {
        const duration = Number(buffer?.duration || 0);
        const latest = Math.max(0, duration - grainDuration);
        if (index === 0 || latest === 0) return latest;
        const earliest = Math.max(0, latest - CONCEALMENT_WINDOW_SECONDS);
        const phase = (index * GOLDEN_RATIO_FRACTION) % 1;
        return earliest + ((latest - earliest) * phase);
    }

    function similarityOffset(buffer, index, grainDuration, referenceOffset, matchDuration) {
        if (typeof buffer?.getChannelData !== 'function') {
            return grainOffset(buffer, index, grainDuration);
        }
        const sampleRate = Math.max(1, Number(buffer.sampleRate || 48000));
        const data = buffer.getChannelData(0);
        const grainFrames = Math.max(1, Math.round(grainDuration * sampleRate));
        const latestFrame = Math.max(0, data.length - grainFrames);
        const earliestFrame = Math.max(
            0,
            latestFrame - Math.round(CONCEALMENT_WINDOW_SECONDS * sampleRate)
        );
        const frames = Math.max(8, Math.min(
            Math.round(Math.min(MATCH_SECONDS, matchDuration) * sampleRate),
            data.length - 1
        ));
        const referenceFrame = Math.max(0, Math.min(
            data.length - frames,
            Math.round(referenceOffset * sampleRate)
        ));
        const step = Math.max(1, Math.round(SEARCH_STEP_SECONDS * sampleRate));
        let bestFrame = -1;
        let bestScore = -Infinity;
        let alternateFrame = -1;
        let alternateScore = -Infinity;

        for (let candidate = earliestFrame; candidate <= latestFrame; candidate += step) {
            let product = 0;
            let referencePower = 0;
            let candidatePower = 0;
            for (let frame = 0; frame < frames; frame += 1) {
                const left = data[referenceFrame + frame] || 0;
                const right = data[candidate + frame] || 0;
                product += left * right;
                referencePower += left * left;
                candidatePower += right * right;
            }
            const denominator = Math.sqrt(referencePower * candidatePower);
            const score = denominator > 1e-9 ? product / denominator : -1;
            if (score > bestScore) {
                bestScore = score;
                bestFrame = candidate;
            }
            if (Math.abs(candidate - referenceFrame) > step * 2 && score > alternateScore) {
                alternateScore = score;
                alternateFrame = candidate;
            }
        }

        // Periodic material has several clean joins. Rotate between them so concealment cannot
        // freeze on one audible grain; keep the best match for complex material.
        if (index > 1 && alternateFrame >= 0
            && alternateScore >= Math.max(0.82, bestScore - 0.08)) {
            return alternateFrame / sampleRate;
        }
        return bestFrame >= 0
            ? bestFrame / sampleRate
            : grainOffset(buffer, index, grainDuration);
    }

    function shapeGrain(param, startAt, peakAt, endAt) {
        try {
            param?.cancelScheduledValues?.(startAt);
            param?.setValueAtTime?.(0.0001, startAt);
            param?.linearRampToValueAtTime?.(1, peakAt);
            param?.linearRampToValueAtTime?.(0.0001, endAt);
        } catch {}
    }

    function grainLevel(grain, at) {
        if (at < grain.startAt || at >= grain.envelopeEnd) return 0;
        if (at <= grain.peakAt) {
            return (at - grain.startAt) / Math.max(0.001, grain.peakAt - grain.startAt);
        }
        return (grain.envelopeEnd - at)
            / Math.max(0.001, grain.envelopeEnd - grain.peakAt);
    }

    function incomingAlignmentOffset(entry, at, incomingBuffer) {
        if (typeof incomingBuffer?.getChannelData !== 'function') return 0;
        const grain = (entry?.grains || [])
            .filter((candidate) => grainLevel(candidate, at) > 0)
            .sort((left, right) => grainLevel(right, at) - grainLevel(left, at))[0];
        if (!grain || typeof grain.buffer?.getChannelData !== 'function') return 0;
        const referenceRate = Math.max(1, Number(grain.buffer.sampleRate || 48000));
        const incomingRate = Math.max(1, Number(incomingBuffer.sampleRate || referenceRate));
        const reference = grain.buffer.getChannelData(0);
        const incoming = incomingBuffer.getChannelData(0);
        const referenceFrame = Math.round(
            (grain.offset + Math.max(0, at - grain.startAt)) * referenceRate
        );
        const frames = Math.max(8, Math.min(
            Math.round(HANDOFF_MATCH_SECONDS * referenceRate),
            reference.length - referenceFrame - 1
        ));
        if (frames < 8) return 0;
        const maxCandidate = Math.min(
            Math.round(MAX_HANDOFF_SKIP_SECONDS * incomingRate),
            incoming.length - Math.ceil(frames * incomingRate / referenceRate) - 1
        );
        if (maxCandidate <= 0) return 0;
        const step = Math.max(1, Math.round(incomingRate * 0.00025));
        let bestFrame = 0;
        let bestScore = -Infinity;
        for (let candidate = 0; candidate <= maxCandidate; candidate += step) {
            let product = 0;
            let referencePower = 0;
            let candidatePower = 0;
            for (let frame = 0; frame < frames; frame += 1) {
                const left = reference[referenceFrame + frame] || 0;
                const rightIndex = candidate + Math.round(frame * incomingRate / referenceRate);
                const right = incoming[rightIndex] || 0;
                product += left * right;
                referencePower += left * left;
                candidatePower += right * right;
            }
            const denominator = Math.sqrt(referencePower * candidatePower);
            const score = denominator > 1e-9 ? product / denominator : -1;
            if (score > bestScore) {
                bestScore = score;
                bestFrame = candidate;
            }
        }
        return bestScore > 0 ? bestFrame / incomingRate : 0;
    }

    Object.assign(ns, {
        ready: true,
        matchedFade,
        similarityOffset,
        shapeGrain,
        incomingAlignmentOffset,
        constants: {
            CROSSFADE_SECONDS,
            CONCEALMENT_WINDOW_SECONDS,
            GRAIN_SECONDS,
            MIN_GRAIN_SECONDS
        }
    });
})();
