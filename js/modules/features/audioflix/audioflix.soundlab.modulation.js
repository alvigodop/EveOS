window.EveAudioflixSoundLabModulation = window.EveAudioflixSoundLabModulation || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabModulation;
    if (ns.ready) return;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

    function create(options) {
        let frame = 0;
        let lastFrameAt = 0;
        let active = false;
        let bins = null;
        let wave = null;
        let metrics = { low: 0, mid: 0, high: 0, rms: 0, active: false };

        const analyser = () => options.analyser?.() || null;
        const effects = () => options.effects?.() || null;
        const snapshot = () => options.state?.() || {};

        function average(data, analyserNode, minHz, maxHz) {
            if (!data?.length || !analyserNode) return 0;
            const nyquist = Number(analyserNode.context?.sampleRate || 48000) / 2;
            const start = Math.max(0, Math.floor((minHz / nyquist) * data.length));
            const end = Math.min(data.length, Math.ceil((maxHz / nyquist) * data.length));
            if (end <= start) return 0;
            let total = 0;
            for (let index = start; index < end; index += 1) total += data[index] / 255;
            return total / (end - start);
        }

        function rootMeanSquare(data) {
            if (!data?.length) return 0;
            let total = 0;
            for (let index = 0; index < data.length; index += 1) {
                total += data[index] * data[index];
            }
            return Math.sqrt(total / data.length);
        }

        function reset() {
            metrics = { low: 0, mid: 0, high: 0, rms: 0, active: false };
            effects()?.applyModulation?.({});
            options.publish?.(metrics);
        }

        function sample(time) {
            if (!active) return;
            frame = requestAnimationFrame(sample);
            if (time - lastFrameAt < 40) return;
            lastFrameAt = time;
            const analyserNode = analyser();
            const state = snapshot();
            const settings = state.modulation || {};
            if (!analyserNode || settings.enabled !== true) {
                if (metrics.active) reset();
                return;
            }
            if (!bins || bins.length !== analyserNode.frequencyBinCount) {
                bins = new Uint8Array(analyserNode.frequencyBinCount);
                wave = new Float32Array(analyserNode.fftSize);
            }
            analyserNode.getByteFrequencyData(bins);
            analyserNode.getFloatTimeDomainData(wave);
            const smoothing = clamp(settings.smoothing, 0, 0.98);
            const next = {
                low: average(bins, analyserNode, 35, 250),
                mid: average(bins, analyserNode, 250, 4000),
                high: average(bins, analyserNode, 4000, 16000),
                rms: rootMeanSquare(wave)
            };
            ['low', 'mid', 'high', 'rms'].forEach((key) => {
                next[key] = metrics[key] * smoothing + next[key] * (1 - smoothing);
            });
            metrics = Object.assign(next, { active: true });

            const base = state.effects || {};
            const values = {};
            if (settings.lowToFilter?.enabled && base.filter?.enabled) {
                const octaves = (metrics.low - 0.28) * Number(settings.lowToFilter.depth || 0) * 3;
                values.filterFrequency = clamp(Number(base.filter.frequency || 18000) * (2 ** octaves), 40, 20000);
            }
            if (settings.rmsToReverb?.enabled && base.reverb?.enabled) {
                values.reverbMix = clamp(
                    Number(base.reverb.mix || 0) + Math.max(0, metrics.rms - 0.04)
                        * Number(settings.rmsToReverb.depth || 0) * 4,
                    0,
                    0.75
                );
            }
            if (settings.highToWidth?.enabled && base.stereo?.enabled) {
                values.stereoWidth = clamp(
                    Number(base.stereo.width || 1) + (metrics.high - 0.2)
                        * Number(settings.highToWidth.depth || 0),
                    0,
                    1.5
                );
            }
            effects()?.applyModulation?.(values);
            options.publish?.(metrics);
        }

        function start() {
            if (active) return;
            active = true;
            frame = requestAnimationFrame(sample);
        }

        function stop() {
            active = false;
            cancelAnimationFrame(frame);
            frame = 0;
            reset();
        }

        return {
            start,
            stop,
            reset,
            getMetrics: () => Object.assign({}, metrics)
        };
    }

    Object.assign(ns, { ready: true, create });
})();
