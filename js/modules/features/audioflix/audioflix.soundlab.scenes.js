window.EveAudioflixSoundLabScenes = window.EveAudioflixSoundLabScenes || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabScenes;
    if (ns.ready) return;

    let timer = 0;
    let running = false;
    let latestScene = null;
    let lastSteeringAt = 0;

    const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
    const lerp = (a, b, amount) => Number(a || 0) + (Number(b || 0) - Number(a || 0)) * amount;

    function blendObject(a, b, amount) {
        const left = a && typeof a === 'object' ? a : {};
        const right = b && typeof b === 'object' ? b : {};
        const result = {};
        new Set([...Object.keys(left), ...Object.keys(right)]).forEach((key) => {
            const from = left[key];
            const to = right[key];
            if (typeof from === 'number' || typeof to === 'number') {
                result[key] = lerp(from, to, amount);
            } else if (from && to && typeof from === 'object' && typeof to === 'object'
                && !Array.isArray(from) && !Array.isArray(to)) {
                result[key] = blendObject(from, to, amount);
            } else {
                result[key] = amount < 0.5 ? (from ?? to) : (to ?? from);
            }
        });
        return result;
    }

    function blendPrompts(a, b, amount) {
        const left = Array.isArray(a) ? a : [];
        const right = Array.isArray(b) ? b : [];
        const byKey = new Map();
        left.forEach((prompt) => {
            const key = String(prompt.id || prompt.text || '').toLowerCase();
            if (key) byKey.set(key, { left: prompt });
        });
        right.forEach((prompt) => {
            const key = String(prompt.id || prompt.text || '').toLowerCase();
            if (!key) return;
            byKey.set(key, Object.assign(byKey.get(key) || {}, { right: prompt }));
        });
        return [...byKey.values()].map((pair, index) => {
            const from = pair.left || pair.right;
            const to = pair.right || pair.left;
            return {
                id: String((amount < 0.5 ? from : to).id || `morph_${index}`),
                text: String((amount < 0.5 ? from : to).text || ''),
                weight: lerp(pair.left?.weight || 0, pair.right?.weight || 0, amount),
                color: String((amount < 0.5 ? from : to).color || '#20e3b2'),
                cc: Math.round(lerp(from.cc || 16 + index, to.cc || 16 + index, amount))
            };
        }).filter((prompt) => prompt.text && prompt.weight > 0.001);
    }

    function blendScenes(from, to, amount) {
        const t = clamp01(amount);
        return {
            prompts: blendPrompts(from.prompts, to.prompts, t),
            config: blendObject(from.config, to.config, t),
            effects: blendObject(from.effects, to.effects, t),
            modulation: blendObject(from.modulation, to.modulation, t),
            diagnostics: t < 0.5 ? from.diagnostics : to.diagnostics,
            visualizerMode: t < 0.5 ? from.visualizerMode : to.visualizerMode,
            masterVolume: lerp(from.masterVolume, to.masterVolume, t),
            bufferSeconds: lerp(from.bufferSeconds, to.bufferSeconds, t)
        };
    }

    function commit(scene, reason) {
        if (!scene) return;
        window.EveAudioflixSoundLabState?.update?.(
            Object.assign(scene, { activePresetId: '' }),
            reason || 'audioflix-soundlab-scene-hold'
        );
    }

    function cancel(options) {
        if (timer) window.clearTimeout(timer);
        timer = 0;
        if (running && latestScene && options?.commit !== false) commit(latestScene);
        running = false;
        latestScene = null;
    }

    function morph(fromSlot, toSlot, seconds) {
        cancel();
        const stateApi = window.EveAudioflixSoundLabState;
        const state = stateApi?.ensure?.() || {};
        const from = state.sceneSlots?.[fromSlot];
        const to = state.sceneSlots?.[toSlot];
        if (!from || !to) throw new Error('Capture both Scene A and Scene B before morphing.');
        const duration = Math.max(0.5, Math.min(20, Number(seconds) || state.sceneMorphSeconds || 4));
        const startedAt = performance.now();
        running = true;
        latestScene = null;
        lastSteeringAt = 0;

        function step() {
            if (!running) return;
            const now = performance.now();
            const progress = clamp01((now - startedAt) / (duration * 1000));
            const eased = progress * progress * (3 - 2 * progress);
            const scene = blendScenes(from, to, eased);
            const steer = progress >= 1 || !lastSteeringAt || now - lastSteeringAt >= 600;
            latestScene = scene;
            if (steer) lastSteeringAt = now;
            window.EveAudioflixSoundLabEngine?.applyScene?.(scene, {
                steer,
                transient: progress < 1
            });
            window.dispatchEvent(new CustomEvent('eve:audioflix-soundlab-scene', {
                detail: { progress, from: fromSlot, to: toSlot, running: progress < 1 }
            }));
            if (progress < 1) timer = window.setTimeout(step, 120);
            else {
                timer = 0;
                running = false;
                commit(scene, 'audioflix-soundlab-scene-morph');
                latestScene = null;
            }
        }

        step();
        return true;
    }

    Object.assign(ns, {
        ready: true,
        blendScenes,
        morph,
        cancel,
        isRunning: () => running
    });
})();
