window.EveAudioflixSoundLabSteering = window.EveAudioflixSoundLabSteering || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabSteering;
    if (ns.ready) return;

    function create(options) {
        const getSession = options?.getSession || (() => null);
        const getPrompts = options?.getPrompts || (() => []);
        const getConfig = options?.getConfig || (() => ({}));
        const publish = options?.publish || (() => {});
        const delayMs = Math.max(100, Number(options?.delayMs) || 380);
        let timer = 0;
        let busy = false;
        let pending = null;
        let appliedSession = null;
        let appliedSignature = '';
        let appliedConfig = null;

        const signature = (prompts, config) => JSON.stringify([prompts, config]);
        const hardTransition = (config) => !!appliedConfig && (
            Number(config.bpm) !== Number(appliedConfig.bpm)
            || String(config.scale || '') !== String(appliedConfig.scale || '')
        );

        async function apply(request, targetSession) {
            const liveSession = targetSession || getSession();
            if (!liveSession) return false;
            if (liveSession !== appliedSession) {
                appliedSession = liveSession;
                appliedSignature = '';
                appliedConfig = null;
            }
            const scene = request?.scene || null;
            const prompts = getPrompts(scene);
            const config = getConfig(scene);
            const nextSignature = signature(prompts, config);
            const shouldReset = request?.resetContext === true || hardTransition(config);
            if (nextSignature === appliedSignature && !shouldReset) return true;

            await liveSession.setWeightedPrompts({ weightedPrompts: prompts });
            await liveSession.setMusicGenerationConfig({ musicGenerationConfig: config });
            if (shouldReset) await Promise.resolve(liveSession.resetContext?.());
            appliedSignature = nextSignature;
            appliedConfig = Object.assign({}, config);
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
            pending = {
                resetContext: pending?.resetContext === true || next.resetContext === true,
                scene: hasScene ? next.scene : (pending?.scene || null)
            };
            schedule();
        }

        function clear(resetSession = true) {
            if (timer) window.clearTimeout(timer);
            timer = 0;
            pending = null;
            if (resetSession) reset();
        }

        function reset() {
            appliedSession = null;
            appliedSignature = '';
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
