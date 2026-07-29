window.EveAudioflixSoundLabUiEvents = window.EveAudioflixSoundLabUiEvents || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabUiEvents;
    if (ns.ready) return;

    const labState = () => window.EveAudioflixSoundLabState;
    const engine = () => window.EveAudioflixSoundLabEngine;

    function numeric(target) {
        const value = Number(target.value);
        return Number.isFinite(value) ? value : 0;
    }

    function updateOutput(target, value) {
        const root = target.closest('[data-audioflix-soundlab]');
        if (target.dataset.sfPrompt) {
            const output = root?.querySelector(`[data-sf-prompt-weight="${CSS.escape(target.dataset.sfPrompt)}"]`);
            if (output) output.textContent = Number(value).toFixed(2);
        }
        const knob = target.closest('.sonic-forge-knob-shell');
        if (knob) {
            const min = Number(target.min || 0);
            const max = Number(target.max || 1);
            knob.style.setProperty('--sf-knob', String(
                Math.max(0, Math.min(1, (Number(value) - min) / (max - min || 1)))
            ));
        }
        if (target.dataset.sfConfig) {
            const output = root?.querySelector(`[data-sf-output="${CSS.escape(target.dataset.sfConfig)}"]`);
            if (output) output.textContent = String(value);
        }
    }

    function applyConfig(target) {
        const current = labState()?.ensure?.() || {};
        const key = target.dataset.sfConfig;
        if (!key) return false;
        const value = target.type === 'checkbox'
            ? target.checked
            : (['scale', 'musicGenerationMode'].includes(key) ? target.value : numeric(target));
        if (current.config?.[key] === value) {
            updateOutput(target, value);
            return true;
        }
        labState()?.update?.({
            config: Object.assign({}, current.config || {}, { [key]: value }),
            activePresetId: ''
        }, 'audioflix-soundlab-config');
        updateOutput(target, value);
        engine()?.queueSteering?.({ resetContext: key === 'bpm' || key === 'scale' });
        return true;
    }

    function applyPrompt(target) {
        const id = target.dataset.sfPrompt;
        if (!id) return false;
        const field = target.dataset.sfField;
        const patch = {};
        const current = (labState()?.ensure?.().prompts || []).find((prompt) => prompt.id === id);
        if (field === 'prompt-text') patch.text = String(target.value || '').trim();
        else if (field === 'prompt-weight') patch.weight = numeric(target);
        else if (field === 'prompt-color') patch.color = target.value;
        else if (field === 'prompt-cc') patch.cc = Math.round(numeric(target));
        else return false;
        const key = field.replace('prompt-', '');
        if (current && current[key] === patch[key]) return true;
        labState()?.updatePrompt?.(id, patch);
        if (field === 'prompt-weight') updateOutput(target, patch.weight);
        if (field !== 'prompt-cc') engine()?.queueSteering?.();
        return true;
    }

    function handleInput(target) {
        const field = target?.dataset?.sfField;
        if (!field) return false;
        if (field === 'prompt-text') return true;
        if (field.startsWith('prompt-')) return applyPrompt(target);
        if (field === 'config' && target.type === 'range') return applyConfig(target);
        if (field === 'master-volume') {
            engine()?.setMasterVolume?.(numeric(target), false);
            return true;
        }
        if (field === 'recording-name' || field === 'recording-dir') return true;
        return false;
    }

    async function handleChange(target) {
        const field = target?.dataset?.sfField;
        if (!field) return false;
        if (field.startsWith('prompt-')) return applyPrompt(target);
        if (field === 'config') return applyConfig(target);
        if (field === 'visualizer-mode') {
            labState()?.update?.({ visualizerMode: target.value }, 'audioflix-soundlab-visualizer');
            return true;
        }
        if (field === 'master-volume') {
            engine()?.setMasterVolume?.(numeric(target), true);
            return true;
        }
        if (field === 'recording-name') {
            labState()?.update?.({ recordingName: target.value }, 'audioflix-soundlab-recording-name');
            return true;
        }
        if (field === 'recording-dir') {
            labState()?.update?.({ recordingDir: target.value }, 'audioflix-soundlab-recording-dir');
            return true;
        }
        if (field === 'midi-enabled') {
            try {
                await window.EveAudioflixSoundLabMidi?.setEnabled?.(target.checked);
            } catch {
                target.checked = false;
            }
            return true;
        }
        if (field === 'midi-input') {
            await window.EveAudioflixSoundLabMidi?.selectInput?.(target.value);
            return true;
        }
        if (field === 'preset-file') {
            await window.EveAudioflixSoundLabPresets?.importFile?.(target.files?.[0]);
            target.value = '';
            window.EveAudioflix?.render?.();
            return true;
        }
        return handleInput(target);
    }

    function selectedPreset(target) {
        return target.closest('[data-audioflix-soundlab]')?.querySelector('[data-sf-preset-select]')?.value || '';
    }

    async function handleAction(target) {
        const action = target?.dataset?.afAction || '';
        if (!action.startsWith('soundlab-')) return null;
        if (action === 'soundlab-connect') await engine()?.connect?.();
        else if (action === 'soundlab-disconnect') await engine()?.disconnect?.();
        else if (action === 'soundlab-play') await engine()?.play?.();
        else if (action === 'soundlab-pause') await engine()?.pause?.();
        else if (action === 'soundlab-stop') await engine()?.stop?.();
        else if (action === 'soundlab-reset') engine()?.resetContext?.();
        else if (action === 'soundlab-add-prompt') {
            labState()?.addPrompt?.();
            return { rerender: true };
        } else if (action === 'soundlab-control-view') {
            const controlView = target.dataset.sfView === 'knobs' ? 'knobs' : 'sliders';
            labState()?.update?.({ controlView }, 'audioflix-soundlab-control-view');
            return { rerender: true };
        } else if (action === 'soundlab-prompt-view') {
            const promptControlView = target.dataset.sfView === 'sliders' ? 'sliders' : 'knobs';
            labState()?.update?.({ promptControlView }, 'audioflix-soundlab-prompt-view');
            return { rerender: true };
        } else if (action === 'soundlab-remove-prompt') {
            labState()?.removePrompt?.(target.dataset.sfPrompt);
            engine()?.queueSteering?.();
            return { rerender: true };
        } else if (action === 'soundlab-save-preset') {
            const root = target.closest('[data-audioflix-soundlab]');
            const input = root?.querySelector('[data-sf-preset-name]');
            const name = String(input?.value || '').trim()
                || `Scene ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            labState()?.savePreset?.(name);
            return { rerender: true };
        } else if (action === 'soundlab-load-preset') {
            const id = selectedPreset(target);
            if (id) {
                labState()?.loadPreset?.(id);
                await engine()?.applySteering?.({ resetContext: true });
            }
            return { rerender: true };
        } else if (action === 'soundlab-remove-preset') {
            const id = selectedPreset(target);
            if (id) labState()?.removePreset?.(id);
            return { rerender: true };
        } else if (action === 'soundlab-export-presets') {
            window.EveAudioflixSoundLabPresets?.exportScenes?.();
            return { rerender: true };
        } else if (action === 'soundlab-import-presets') {
            target.closest('[data-audioflix-soundlab]')?.querySelector('[data-sf-field="preset-file"]')?.click();
            return { rerender: false };
        } else if (action === 'soundlab-toggle-record') {
            const recording = window.EveAudioflixSoundLabRecording;
            if (recording?.getStatus?.().recording) await recording.stop();
            else await recording?.start?.();
        } else if (action === 'soundlab-download-recording') {
            const current = labState()?.ensure?.() || {};
            window.EveAudioflixSoundLabRecording?.download?.(current.recordingName);
        } else if (action === 'soundlab-save-recording') {
            await window.EveAudioflixSoundLabRecording?.addToLibrary?.();
        }
        return { rerender: false };
    }

    Object.assign(ns, { ready: true, handleInput, handleChange, handleAction });
})();
