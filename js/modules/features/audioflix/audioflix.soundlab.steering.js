window.EveAudioflixSoundLabSteering = window.EveAudioflixSoundLabSteering || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabSteering;
    if (ns.ready) return;

    function create(options) {
        const getSession = options?.getSession || (() => null);
        const getPrompts = options?.getPrompts || (() => []);
        const getConfig = options?.getConfig || (() => ({}));
        const isPlaying = options?.isPlaying || (() => false);
        const publish = options?.publish || (() => {});
        const delayMs = Math.max(100, Number(options?.delayMs) || 380);
        const transitionSteps = Math.max(1, Math.min(4, Number(options?.transitionSteps) || 2));
        const transitionDurationMs = Math.max(0, Number(options?.transitionDurationMs) || 320);
        let timer = 0;
        let busy = false;
        let pending = null;
        let appliedSession = null;
        let appliedSignature = '';
        let appliedPrompts = null;
        let appliedPromptSignature = '';
        let appliedConfigSignature = '';
        let appliedConfig = null;
        let generation = 0;

        const signature = (value) => JSON.stringify(value);
        const sleep = (milliseconds) => new Promise(resolve => window.setTimeout(resolve, milliseconds));
        const copyPrompts = (prompts) => (Array.isArray(prompts) ? prompts : []).map(prompt => ({
            text: String(prompt?.text || '').trim(),
            weight: Number(prompt?.weight) || 0.01
        })).filter(prompt => prompt.text);
        const nonZero = (value, signHint = 1) => {
            const number = Number(value);
            if (Number.isFinite(number) && Math.abs(number) >= 0.01) return number;
            return signHint < 0 ? -0.01 : 0.01;
        };
        const interpolatePrompts = (previous, next, ratio) => {
            const before = new Map(copyPrompts(previous).map(prompt => [prompt.text, prompt.weight]));
            const after = new Map(copyPrompts(next).map(prompt => [prompt.text, prompt.weight]));
            return [...new Set([...before.keys(), ...after.keys()])].map(text => {
                const oldWeight = before.has(text)
                    ? before.get(text)
                    : nonZero(0, Math.sign(after.get(text)) || 1);
                const newWeight = after.has(text)
                    ? after.get(text)
                    : nonZero(0, Math.sign(before.get(text)) || 1);
                const interpolated = oldWeight + ((newWeight - oldWeight) * ratio);
                const signHint = ratio < 0.5 ? Math.sign(oldWeight) : Math.sign(newWeight);
                return { text, weight: nonZero(interpolated, signHint || 1) };
            });
        };
        // A bpm or scale change needs resetContext(), which is an audible discontinuity. When a
        // parameter is on auto it is absent from the payload, so "absent" must read as UNCHANGED —
        // otherwise toggling auto, or any rebuild of the payload, would fire a reset every pass.
        const changedHard = (next, prev, key) => {
            const hasNext = next[key] !== undefined;
            const hasPrev = prev[key] !== undefined;
            if (!hasNext || !hasPrev) return false;
            return String(next[key]) !== String(prev[key]);
        };
        const hardTransition = (config) => !!appliedConfig && (
            changedHard(config, appliedConfig, 'bpm')
            || changedHard(config, appliedConfig, 'scale')
        );

        async function applyPromptTransition(liveSession, prompts, token) {
            const canRamp = isPlaying() && Array.isArray(appliedPrompts) && appliedPrompts.length;
            if (canRamp) {
                const stepDelay = transitionSteps ? transitionDurationMs / transitionSteps : 0;
                for (let step = 1; step <= transitionSteps; step += 1) {
                    if (token !== generation || liveSession !== appliedSession) return false;
                    const ratio = step / (transitionSteps + 1);
                    const intermediate = interpolatePrompts(appliedPrompts, prompts, ratio);
                    await liveSession.setWeightedPrompts({
                        weightedPrompts: intermediate
                    });
                    // A superseding edit must ramp from the last weights the service received.
                    appliedPrompts = copyPrompts(intermediate);
                    appliedPromptSignature = signature(appliedPrompts);
                    if (stepDelay > 0) await sleep(stepDelay);
                }
            }
            if (token !== generation || liveSession !== appliedSession) return false;
            await liveSession.setWeightedPrompts({ weightedPrompts: prompts });
            return token === generation && liveSession === appliedSession;
        }

        async function apply(request, targetSession) {
            const liveSession = targetSession || getSession();
            if (!liveSession) return false;
            const token = Number(request?.generation) || ++generation;
            if (liveSession !== appliedSession) {
                appliedSession = liveSession;
                appliedSignature = '';
                appliedPrompts = null;
                appliedPromptSignature = '';
                appliedConfigSignature = '';
                appliedConfig = null;
            }
            const scene = request?.scene || null;
            const prompts = copyPrompts(getPrompts(scene));
            const config = getConfig(scene);
            const nextPromptSignature = signature(prompts);
            const nextConfigSignature = signature(config);
            const shouldReset = request?.resetContext === true || hardTransition(config);
            const promptChanged = nextPromptSignature !== appliedPromptSignature;
            const configChanged = nextConfigSignature !== appliedConfigSignature;
            if (!promptChanged && !configChanged && !shouldReset) return true;

            if (promptChanged) {
                const completed = await applyPromptTransition(liveSession, prompts, token);
                if (!completed) return false;
                appliedPrompts = copyPrompts(prompts);
                appliedPromptSignature = nextPromptSignature;
            }
            if (configChanged) {
                if (token !== generation || liveSession !== appliedSession) return false;
                await liveSession.setMusicGenerationConfig({ musicGenerationConfig: config });
                appliedConfig = Object.assign({}, config);
                appliedConfigSignature = nextConfigSignature;
            }
            if (shouldReset) await Promise.resolve(liveSession.resetContext?.());
            appliedSignature = signature([appliedPrompts, appliedConfig]);
            return true;
        }

        function schedule(wait = delayMs) {
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(drain, wait);
        }

        async function drain() {
            timer = 0;
            if (busy || !pending) return;
            const request = pending;
            pending = null;
            busy = true;
            try {
                await apply(request);
            } catch (error) {
                publish({
                    phase: 'error',
                    message: error?.message || 'Could not update music controls.'
                });
            } finally {
                busy = false;
                if (pending) schedule(60);
            }
        }

        function queue(request) {
            const next = request && typeof request === 'object' ? request : {};
            const hasScene = Object.prototype.hasOwnProperty.call(next, 'scene');
            generation += 1;
            pending = {
                resetContext: pending?.resetContext === true || next.resetContext === true,
                scene: hasScene ? next.scene : (pending?.scene || null),
                generation
            };
            schedule();
        }

        function clear(resetSession = true) {
            if (timer) window.clearTimeout(timer);
            timer = 0;
            pending = null;
            generation += 1;
            if (resetSession) reset();
        }

        function reset() {
            appliedSession = null;
            appliedSignature = '';
            appliedPrompts = null;
            appliedPromptSignature = '';
            appliedConfigSignature = '';
            appliedConfig = null;
        }

        return {
            apply,
            queue,
            clear,
            reset,
            getState: () => ({
                busy,
                pending: !!pending,
                appliedSignature,
                hasAppliedConfig: !!appliedConfig
            })
        };
    }

    Object.assign(ns, { ready: true, create });
})();
