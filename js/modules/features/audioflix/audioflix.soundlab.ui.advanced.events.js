window.EveAudioflixSoundLabUiAdvancedEvents = window.EveAudioflixSoundLabUiAdvancedEvents || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabUiAdvancedEvents;
    if (ns.ready) return;

    const stateApi = () => window.EveAudioflixSoundLabState;
    const engine = () => window.EveAudioflixSoundLabEngine;
    const number = (target) => Number.isFinite(Number(target.value)) ? Number(target.value) : 0;

    function showOutput(target) {
        const output = target?.closest?.('label')?.querySelector?.('output');
        if (!output) return;
        const key = target.dataset.sfEffectKey || '';
        const suffix = key === 'frequency' ? ' Hz'
            : (['time', 'decay', 'release'].includes(key) || target.dataset.sfField === 'scene-morph-seconds'
                ? 's' : '');
        output.textContent = `${target.value}${suffix}`;
    }

    function withNested(group, key, value) {
        const state = stateApi()?.ensure?.() || {};
        return Object.assign({}, state.effects, {
            [group]: Object.assign({}, state.effects?.[group], { [key]: value })
        });
    }

    function updateNested(group, key, value) {
        const effects = withNested(group, key, value);
        stateApi()?.update?.({ effects, activePresetId: '' }, 'audioflix-soundlab-effect');
        engine()?.applyEffects?.(effects);
        return true;
    }

    function handleInput(target) {
        const field = target?.dataset?.sfField;
        if (field === 'effect' && target.type === 'range') {
            showOutput(target);
            if (target.dataset.sfEffect === 'reverb'
                && target.dataset.sfEffectKey === 'decay') {
                return true;
            }
            engine()?.applyEffects?.(withNested(
                target.dataset.sfEffect,
                target.dataset.sfEffectKey,
                number(target)
            ));
            return true;
        }
        if (field === 'modulation-depth' || field === 'modulation-smoothing'
            || field === 'scene-morph-seconds') {
            showOutput(target);
            return true;
        }
        return false;
    }

    function handleChange(target) {
        const field = target?.dataset?.sfField;
        if (field === 'effect') {
            const value = target.type === 'checkbox' ? target.checked
                : (target.tagName === 'SELECT' ? target.value : number(target));
            showOutput(target);
            if (target.type === 'checkbox') {
                target.closest?.('.sonic-forge-effect-card')?.classList.toggle('is-on', target.checked);
            }
            return updateNested(target.dataset.sfEffect, target.dataset.sfEffectKey, value);
        }
        if (field === 'modulation-enabled') {
            const state = stateApi()?.ensure?.() || {};
            stateApi()?.update?.({
                modulation: Object.assign({}, state.modulation, { enabled: target.checked })
            }, 'audioflix-soundlab-modulation');
            return true;
        }
        if (field === 'modulation-map' || field === 'modulation-depth') {
            const state = stateApi()?.ensure?.() || {};
            const key = target.dataset.sfModulation;
            const modulation = Object.assign({}, state.modulation, {
                [key]: Object.assign({}, state.modulation?.[key], {
                    [field === 'modulation-map' ? 'enabled' : 'depth']:
                        field === 'modulation-map' ? target.checked : number(target)
                })
            });
            stateApi()?.update?.({ modulation }, 'audioflix-soundlab-modulation-map');
            showOutput(target);
            return true;
        }
        if (field === 'modulation-smoothing') {
            const state = stateApi()?.ensure?.() || {};
            stateApi()?.update?.({
                modulation: Object.assign({}, state.modulation, { smoothing: number(target) })
            }, 'audioflix-soundlab-modulation-smoothing');
            showOutput(target);
            return true;
        }
        if (field === 'scene-morph-seconds') {
            stateApi()?.update?.({ sceneMorphSeconds: number(target) }, 'audioflix-soundlab-morph-time');
            showOutput(target);
            return true;
        }
        if (field === 'continuity-auto' || field === 'continuity-attempts') {
            const state = stateApi()?.ensure?.() || {};
            stateApi()?.update?.({
                continuity: Object.assign({}, state.continuity, {
                    [field === 'continuity-auto' ? 'autoReconnect' : 'maxAttempts']:
                        field === 'continuity-auto' ? target.checked : Math.round(number(target))
                })
            }, 'audioflix-soundlab-continuity');
            return true;
        }
        if (field === 'diagnostic') {
            const state = stateApi()?.ensure?.() || {};
            stateApi()?.update?.({
                diagnostics: Object.assign({}, state.diagnostics, {
                    [target.dataset.sfDiagnostic]: target.checked
                })
            }, 'audioflix-soundlab-diagnostics');
            return true;
        }
        if (field === 'render-prompt' || field === 'render-name' || field === 'render-model') {
            const state = stateApi()?.ensure?.() || {};
            const key = field.replace('render-', '');
            stateApi()?.update?.({
                render: Object.assign({}, state.render, { [key]: target.value })
            }, 'audioflix-soundlab-render-settings');
            return true;
        }
        return false;
    }

    async function handleAction(target) {
        const action = target?.dataset?.afAction || '';
        if (action === 'soundlab-capture-scene') {
            stateApi()?.captureSceneSlot?.(target.dataset.sfSlot);
            return { rerender: true };
        }
        if (action === 'soundlab-apply-scene') {
            const next = stateApi()?.applySceneSlot?.(target.dataset.sfSlot);
            engine()?.applyScene?.(next);
            return { rerender: true };
        }
        if (action === 'soundlab-morph-scene') {
            const state = stateApi()?.ensure?.() || {};
            window.EveAudioflixSoundLabScenes?.morph?.(
                target.dataset.sfFrom,
                target.dataset.sfTo,
                state.sceneMorphSeconds
            );
            return { rerender: false };
        }
        if (action === 'soundlab-cancel-morph') {
            window.EveAudioflixSoundLabScenes?.cancel?.();
            return { rerender: false };
        }
        if (action === 'soundlab-render') {
            const state = stateApi()?.ensure?.() || {};
            await window.EveAudioflixSoundLabRendered?.generate?.(state.render);
            return { rerender: true };
        }
        if (action === 'soundlab-render-download') {
            const state = stateApi()?.ensure?.() || {};
            window.EveAudioflixSoundLabRendered?.download?.(state.render?.name);
            return { rerender: false };
        }
        if (action === 'soundlab-render-library') {
            const state = stateApi()?.ensure?.() || {};
            await window.EveAudioflixSoundLabRendered?.addToLibrary?.({
                recordingName: state.render?.name
            });
            return { rerender: false };
        }
        return null;
    }

    Object.assign(ns, { ready: true, handleInput, handleChange, handleAction });
})();
