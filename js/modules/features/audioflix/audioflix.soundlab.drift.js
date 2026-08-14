// Slow automatic movement for Sonic Forge, so a long generation does not sit still.
//
// Two independent lanes, both a bounded random walk on a timer:
//
//   params  — guidance / temperature / topK. These are SAMPLER controls: they always carry a value,
//             so there is no "let the model decide" for them (that is what the auto pills on
//             tempo/density/brightness do). The only automatic option is for us to move them.
//   prompts — the weight of one active musical direction at a time, so the blend evolves. This is
//             the lane the reference PromptDJ project calls "Automatic Variation".
//
// Deliberately ANCHORED: each step walks around the value the user set rather than from wherever it
// happens to be, so drift explores near your settings instead of wandering off and never coming
// back. Move a slider and the anchor follows.
//
// bpm and scale are refused outright — changing either forces resetContext(), an audible
// discontinuity, so moving them continuously would stutter the audio on every step. The refusal
// asks soundlab.config (isSafeToModulate) rather than repeating the list here.
window.EveAudioflixSoundLabDrift = window.EveAudioflixSoundLabDrift || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabDrift;
    if (ns.ready) return;

    // Ranges mirror the UI sliders; a walk must never push a parameter outside what can be set.
    const PARAM_RANGE = {
        guidance: { min: 0, max: 6, round: false },
        temperature: { min: 0, max: 3, round: false },
        topK: { min: 1, max: 1000, round: true }
    };
    const PARAM_KEYS = Object.keys(PARAM_RANGE);
    const MIN_INTERVAL_MS = 900;
    const MAX_INTERVAL_MS = 12000;
    // Never let a prompt fall to silence: at 0 it stops contributing and the blend can collapse.
    const MIN_PROMPT_WEIGHT = 0.05;
    const MAX_PROMPT_WEIGHT = 2;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function cleanLane(lane, defaults) {
        const source = lane && typeof lane === 'object' ? lane : {};
        const rate = Number(source.rate);
        const depth = Number(source.depth);
        return {
            enabled: source.enabled === true,
            // rate is 0..1 "speed": higher means a shorter gap between steps.
            rate: Number.isFinite(rate) ? clamp(rate, 0, 1) : defaults.rate,
            depth: Number.isFinite(depth) ? clamp(depth, 0, 1) : defaults.depth
        };
    }

    function cleanDrift(drift) {
        const source = drift && typeof drift === 'object' ? drift : {};
        return {
            params: cleanLane(source.params, { rate: 0.35, depth: 0.2 }),
            prompts: cleanLane(source.prompts, { rate: 0.5, depth: 0.2 })
        };
    }

    const intervalFor = (rate) => Math.round(
        MAX_INTERVAL_MS - clamp(Number(rate) || 0, 0, 1) * (MAX_INTERVAL_MS - MIN_INTERVAL_MS)
    );

    function create(deps) {
        const getState = deps?.getState || (() => ({}));
        const update = deps?.update || (() => {});
        const queueSteering = deps?.queueSteering || (() => {});
        // Drift writes straight to state, and nothing re-renders on a state change — so without
        // this the controls sat on stale numbers while the audio really was moving, which reads as
        // "the feature does nothing". Reported per step so the UI can patch one control instead of
        // rebuilding the panel on a timer.
        const onApplied = deps?.onApplied || (() => {});
        const random = deps?.random || Math.random;
        const setTimer = deps?.setInterval || window.setInterval.bind(window);
        const clearTimer = deps?.clearInterval || window.clearInterval.bind(window);
        const config = () => window.EveAudioflixSoundLabConfig;

        let paramTimer = 0;
        let promptTimer = 0;
        let paramAnchors = null;
        let promptAnchors = null;

        const drift = () => cleanDrift(getState()?.drift);
        // Signed nudge scaled by depth and the parameter's own range.
        const nudge = (span, depth) => (random() * 2 - 1) * depth * span;

        function captureParamAnchors() {
            const current = getState()?.config || {};
            paramAnchors = {};
            PARAM_KEYS.filter((key) => current.lockedParams?.[key] !== true)
                .forEach((key) => { paramAnchors[key] = Number(current[key]); });
        }

        function capturePromptAnchors() {
            promptAnchors = new Map();
            (getState()?.prompts || []).forEach((prompt) => {
                if (prompt.locked !== true) promptAnchors.set(prompt.id, Number(prompt.weight));
            });
        }

        function rebase(change) {
            if (change?.kind === 'config' && PARAM_RANGE[change.key]) {
                if (!drift().params.enabled) return false;
                if (!paramAnchors) captureParamAnchors();
                const range = PARAM_RANGE[change.key];
                let value = clamp(Number(change.value), range.min, range.max);
                if (!Number.isFinite(value)) return false;
                if (range.round) value = Math.round(value);
                paramAnchors[change.key] = value;
                return true;
            }
            if (change?.kind === 'prompt' && change.id) {
                if (!drift().prompts.enabled) return false;
                if (!promptAnchors) capturePromptAnchors();
                const value = clamp(Number(change.value), MIN_PROMPT_WEIGHT, MAX_PROMPT_WEIGHT);
                if (!Number.isFinite(value)) return false;
                promptAnchors.set(change.id, value);
                return true;
            }
            return false;
        }

        function stepParams() {
            const lane = drift().params;
            if (!lane.enabled) return null;
            const current = getState()?.config || {};
            if (!paramAnchors) captureParamAnchors();
            const keys = PARAM_KEYS.filter((key) => current.lockedParams?.[key] !== true);
            if (!keys.length) return null;
            const key = keys[Math.floor(random() * keys.length)];
            // Belt and braces: the safe-to-modulate list is the authority, not this module's keys.
            if (config()?.isSafeToModulate?.(key) === false) return null;
            const range = PARAM_RANGE[key];
            const anchor = Number.isFinite(paramAnchors[key]) ? paramAnchors[key] : Number(current[key]);
            const span = range.max - range.min;
            let next = clamp(anchor + nudge(span * 0.5, lane.depth), range.min, range.max);
            if (range.round) next = Math.round(next);
            if (Number(current[key]) === next) return null;
            update(
                { config: Object.assign({}, current, { [key]: next }) },
                'audioflix-soundlab-drift-params'
            );
            queueSteering();
            onApplied({ kind: 'config', key, value: next });
            return { key, value: next };
        }

        function stepPrompts() {
            const lane = drift().prompts;
            if (!lane.enabled) return null;
            const prompts = getState()?.prompts || [];
            const active = prompts.filter((prompt) => Number(prompt.weight) > 0 && prompt.locked !== true);
            if (!active.length) return null;
            if (!promptAnchors) capturePromptAnchors();
            const target = active[Math.floor(random() * active.length)];
            const anchor = promptAnchors.has(target.id)
                ? promptAnchors.get(target.id)
                : Number(target.weight);
            const next = Number(clamp(
                anchor + nudge(MAX_PROMPT_WEIGHT * 0.5, lane.depth),
                MIN_PROMPT_WEIGHT, MAX_PROMPT_WEIGHT
            ).toFixed(3));
            if (Number(target.weight) === next) return null;
            update(
                { prompts: prompts.map((prompt) => (prompt.id === target.id
                    ? Object.assign({}, prompt, { weight: next })
                    : prompt)) },
                'audioflix-soundlab-drift-prompts'
            );
            queueSteering();
            onApplied({ kind: 'prompt', id: target.id, value: next });
            return { id: target.id, weight: next };
        }

        // Re-read the lanes and (re)arm only what is enabled. Called on every state change so
        // toggling a lane, or dragging a slider, takes effect without restarting playback.
        function sync() {
            const settings = drift();
            if (paramTimer) { clearTimer(paramTimer); paramTimer = 0; }
            if (promptTimer) { clearTimer(promptTimer); promptTimer = 0; }
            if (settings.params.enabled) {
                captureParamAnchors();
                paramTimer = setTimer(stepParams, intervalFor(settings.params.rate));
            } else {
                paramAnchors = null;
            }
            if (settings.prompts.enabled) {
                capturePromptAnchors();
                promptTimer = setTimer(stepPrompts, intervalFor(settings.prompts.rate));
            } else {
                promptAnchors = null;
            }
            return { params: !!paramTimer, prompts: !!promptTimer };
        }

        function stop() {
            if (paramTimer) clearTimer(paramTimer);
            if (promptTimer) clearTimer(promptTimer);
            paramTimer = promptTimer = 0;
            paramAnchors = promptAnchors = null;
        }

        return {
            sync,
            stop,
            rebase,
            stepParams,
            stepPrompts,
            isRunning: () => !!(paramTimer || promptTimer),
            getIntervals: () => ({
                params: intervalFor(drift().params.rate),
                prompts: intervalFor(drift().prompts.rate)
            })
        };
    }

    Object.assign(ns, {
        ready: true,
        create,
        cleanDrift,
        intervalFor,
        paramKeys: () => PARAM_KEYS.slice(),
        minPromptWeight: MIN_PROMPT_WEIGHT,
        intervalBounds: () => ({ min: MIN_INTERVAL_MS, max: MAX_INTERVAL_MS })
    });
})();
