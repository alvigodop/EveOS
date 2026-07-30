window.EveAudioflixSoundLabEffects = window.EveAudioflixSoundLabEffects || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabEffects;
    if (ns.ready) return;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

    function target(param, value, context, speed = 0.025) {
        if (!param || !context) return;
        const now = context.currentTime;
        try {
            param.cancelScheduledValues(now);
            param.setTargetAtTime(value, now, speed);
        } catch {
            param.value = value;
        }
    }

    function createBlendStage(context, processor) {
        const input = context.createGain();
        const dry = context.createGain();
        const wet = context.createGain();
        const output = context.createGain();
        input.connect(dry);
        input.connect(processor);
        processor.connect(wet);
        dry.connect(output);
        wet.connect(output);
        // Born BYPASSED. GainNodes default to 1, so an un-applied stage summed dry+wet and added
        // +6 dB (with the processor fully wet). apply() is called during graph setup today, but a
        // stage must be safe on its own rather than depending on that ordering.
        dry.gain.value = 1;
        wet.gain.value = 0;
        return {
            input,
            output,
            processor,
            apply(enabled, mix) {
                const amount = enabled ? clamp(mix, 0, 1) : 0;
                target(dry.gain, 1 - amount, context);
                target(wet.gain, amount, context);
            }
        };
    }

    function createStereoStage(context) {
        const input = context.createGain();
        const splitter = context.createChannelSplitter(2);
        const merger = context.createChannelMerger(2);
        const directLeft = context.createGain();
        const crossLeft = context.createGain();
        const directRight = context.createGain();
        const crossRight = context.createGain();
        input.connect(splitter);
        splitter.connect(directLeft, 0);
        splitter.connect(crossLeft, 0);
        splitter.connect(directRight, 1);
        splitter.connect(crossRight, 1);
        directLeft.connect(merger, 0, 0);
        crossRight.connect(merger, 0, 0);
        directRight.connect(merger, 0, 1);
        crossLeft.connect(merger, 0, 1);
        // Born at unity width. With every gain at the default 1 this stage emitted L+R on BOTH
        // channels: a mono collapse at +6 dB whose phase cancellation is an audible comb filter.
        // This stage is always in the signal path, so it must never be left unconfigured.
        directLeft.gain.value = 1;
        directRight.gain.value = 1;
        crossLeft.gain.value = 0;
        crossRight.gain.value = 0;
        return {
            input,
            output: merger,
            apply(width) {
                const safe = clamp(width, 0, 1.5);
                const direct = (1 + safe) / 2;
                const cross = (1 - safe) / 2;
                [directLeft, directRight].forEach((node) => target(node.gain, direct, context));
                [crossLeft, crossRight].forEach((node) => target(node.gain, cross, context));
            }
        };
    }

    function createLimiterStage(context) {
        const input = context.createGain();
        const dry = context.createGain();
        const wet = context.createGain();
        const compressor = context.createDynamicsCompressor();
        const output = context.createGain();
        input.connect(dry);
        input.connect(compressor);
        compressor.connect(wet);
        dry.connect(output);
        wet.connect(output);
        // Born DRY. Both gains defaulted to 1, so an un-applied stage summed the clean signal with a
        // compressor still on the WebAudio defaults (-24 dB, 12:1) — roughly +5 dB and audibly
        // squashed. Also start the compressor at the transparent settings rather than the node's
        // aggressive defaults, so even a partial apply cannot leave it acting early.
        dry.gain.value = 1;
        wet.gain.value = 0;
        compressor.threshold.value = -0.3;
        compressor.knee.value = 0;
        compressor.ratio.value = 20;
        return {
            input,
            output,
            compressor,
            apply(settings) {
                const enabled = settings.enabled !== false;
                target(dry.gain, enabled ? 0 : 1, context);
                target(wet.gain, enabled ? 1 : 0, context);
                target(compressor.threshold, clamp(settings.threshold, -24, 0), context);
                target(compressor.knee, clamp(settings.knee, 0, 30), context);
                target(compressor.ratio, clamp(settings.ratio, 1, 20), context);
                target(compressor.attack, clamp(settings.attack, 0, 1), context);
                target(compressor.release, clamp(settings.release, 0.01, 1), context);
            }
        };
    }

    function create(context) {
        if (!context) throw new Error('Sonic Forge effects need an AudioContext.');
        const input = context.createGain();
        const output = context.createGain();
        const filterNode = context.createBiquadFilter();
        const filter = createBlendStage(context, filterNode);
        const delayNode = context.createDelay(1.5);
        const delay = createBlendStage(context, delayNode);
        const feedback = context.createGain();
        delayNode.connect(feedback);
        feedback.connect(delayNode);
        const convolver = context.createConvolver();
        const reverb = createBlendStage(context, convolver);
        const stereo = createStereoStage(context);
        const limiter = createLimiterStage(context);
        let config = null;
        let modulation = {};
        let impulseDecay = 0;

        input.connect(filter.input);
        filter.output.connect(delay.input);
        delay.output.connect(reverb.input);
        reverb.output.connect(stereo.input);
        stereo.output.connect(limiter.input);
        limiter.output.connect(output);

        function impulse(decay) {
            const safe = clamp(decay, 0.2, 8);
            if (Math.abs(safe - impulseDecay) < 0.05 && convolver.buffer) return;
            impulseDecay = safe;
            const length = Math.max(1, Math.round(context.sampleRate * safe));
            const buffer = context.createBuffer(2, length, context.sampleRate);
            for (let channel = 0; channel < 2; channel += 1) {
                const data = buffer.getChannelData(channel);
                for (let index = 0; index < length; index += 1) {
                    const envelope = Math.pow(1 - index / length, 2.4);
                    data[index] = (Math.random() * 2 - 1) * envelope;
                }
            }
            convolver.buffer = buffer;
        }

        function apply(next) {
            config = window.EveAudioflixSoundLabState?.cleanEffects?.(next) || next;
            if (!config) return false;
            filterNode.type = config.filter.type;
            target(filterNode.frequency,
                clamp(modulation.filterFrequency ?? config.filter.frequency, 40, 20000), context);
            target(filterNode.Q, config.filter.q, context);
            filter.apply(config.filter.enabled, config.filter.mix);

            target(delayNode.delayTime, config.delay.time, context);
            target(feedback.gain, config.delay.enabled ? config.delay.feedback : 0, context);
            delay.apply(config.delay.enabled, config.delay.mix);

            if (config.reverb.enabled || convolver.buffer) {
                impulse(config.reverb.decay);
            }
            reverb.apply(config.reverb.enabled,
                clamp(modulation.reverbMix ?? config.reverb.mix, 0, 0.75));

            stereo.apply(config.stereo.enabled
                ? clamp(modulation.stereoWidth ?? config.stereo.width, 0, 1.5)
                : 1);
            limiter.apply(config.limiter);
            return true;
        }

        function applyModulation(values) {
            modulation = values && typeof values === 'object' ? values : {};
            if (!config) return false;
            target(filterNode.frequency,
                clamp(modulation.filterFrequency ?? config.filter.frequency, 40, 20000), context, 0.05);
            reverb.apply(config.reverb.enabled,
                clamp(modulation.reverbMix ?? config.reverb.mix, 0, 0.75));
            stereo.apply(config.stereo.enabled
                ? clamp(modulation.stereoWidth ?? config.stereo.width, 0, 1.5)
                : 1);
            return true;
        }

        function dispose() {
            [
                input, filter.input, filter.output, delay.input, delay.output, feedback,
                reverb.input, reverb.output, stereo.input, stereo.output,
                limiter.input, limiter.output, output
            ].forEach((node) => {
                try { node.disconnect(); } catch {}
            });
        }

        return {
            input,
            output,
            apply,
            applyModulation,
            dispose,
            metrics: () => ({
                limiterReduction: Number(limiter.compressor.reduction || 0),
                impulseSeconds: impulseDecay
            })
        };
    }

    Object.assign(ns, { ready: true, create });
})();
