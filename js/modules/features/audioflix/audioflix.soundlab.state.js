window.EveAudioflixSoundLabState = window.EveAudioflixSoundLabState || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabState;
    if (ns.ready) return;

    const COLORS = ['#20e3b2', '#67b7ff', '#ffba55', '#ff6f91', '#c798ff', '#9fe870'];
    const MODES = ['frequency', 'waveform', 'radial', 'spectrogram'];
    const SCALES = [
        'SCALE_UNSPECIFIED', 'C_MAJOR_A_MINOR', 'D_FLAT_MAJOR_B_FLAT_MINOR',
        'D_MAJOR_B_MINOR', 'E_FLAT_MAJOR_C_MINOR', 'E_MAJOR_D_FLAT_MINOR',
        'F_MAJOR_D_MINOR', 'G_FLAT_MAJOR_E_FLAT_MINOR', 'G_MAJOR_E_MINOR',
        'A_FLAT_MAJOR_F_MINOR', 'A_MAJOR_G_FLAT_MINOR', 'B_FLAT_MAJOR_G_MINOR',
        'B_MAJOR_A_FLAT_MINOR'
    ];

    const DEFAULT_PROMPTS = [
        { id: 'prompt_atmosphere', text: 'warm cinematic atmosphere with evolving harmony', weight: 1, color: COLORS[0], cc: 16 },
        { id: 'prompt_rhythm', text: 'patient electronic percussion and deep bass pulse', weight: 0.65, color: COLORS[1], cc: 17 },
        { id: 'prompt_texture', text: 'shimmering analog synth texture, spacious and detailed', weight: 0.45, color: COLORS[2], cc: 18 }
    ];

    function clamp(value, min, max, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
    }

    function text(value, fallback = '', max = 240) {
        const result = String(value ?? '').trim() || String(fallback ?? '').trim();
        return result.slice(0, max);
    }

    function id(prefix) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    }

    function cleanPrompt(prompt, index) {
        const source = prompt && typeof prompt === 'object' ? prompt : {};
        return {
            id: text(source.id, id('prompt'), 80),
            text: text(source.text, index === 0 ? 'ambient instrumental music' : '', 280),
            weight: clamp(source.weight, 0, 2, index === 0 ? 1 : 0.5),
            color: /^#[0-9a-f]{6}$/i.test(String(source.color || '')) ? source.color : COLORS[index % COLORS.length],
            cc: Math.round(clamp(source.cc, 0, 127, 16 + index))
        };
    }

    function cleanConfig(config) {
        const source = config && typeof config === 'object' ? config : {};
        return {
            bpm: Math.round(clamp(source.bpm, 60, 200, 96)),
            density: clamp(source.density, 0, 1, 0.55),
            brightness: clamp(source.brightness, 0, 1, 0.48),
            guidance: clamp(source.guidance, 0, 6, 3.2),
            temperature: clamp(source.temperature, 0, 3, 1.1),
            topK: Math.round(clamp(source.topK, 1, 1000, 40)),
            seed: Math.max(0, Math.round(clamp(source.seed, 0, 2147483647, 0))),
            scale: SCALES.includes(source.scale) ? source.scale : 'SCALE_UNSPECIFIED',
            musicGenerationMode: ['QUALITY', 'DIVERSITY', 'VOCALIZATION'].includes(source.musicGenerationMode)
                ? source.musicGenerationMode : 'QUALITY',
            muteBass: source.muteBass === true,
            muteDrums: source.muteDrums === true,
            onlyBassAndDrums: source.onlyBassAndDrums === true
        };
    }

    function cleanPreset(preset, index) {
        const source = preset && typeof preset === 'object' ? preset : {};
        return {
            id: text(source.id, id('preset'), 80),
            name: text(source.name, `Preset ${index + 1}`, 80),
            prompts: cleanPrompts(source.prompts),
            config: cleanConfig(source.config),
            createdAt: Number(source.createdAt || 0) || Date.now(),
            updatedAt: Number(source.updatedAt || 0) || Date.now()
        };
    }

    function cleanPrompts(prompts) {
        const result = (Array.isArray(prompts) ? prompts : DEFAULT_PROMPTS)
            .slice(0, 16)
            .map(cleanPrompt)
            .filter((prompt) => !!prompt.text);
        return result.length ? result : DEFAULT_PROMPTS.map(cleanPrompt);
    }

    function normalize(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            schemaVersion: 2,
            prompts: cleanPrompts(source.prompts),
            config: cleanConfig(source.config),
            presets: (Array.isArray(source.presets) ? source.presets : []).slice(-24).map(cleanPreset),
            activePresetId: text(source.activePresetId, '', 80),
            controlView: ['sliders', 'knobs'].includes(source.controlView) ? source.controlView : 'sliders',
            promptControlView: ['sliders', 'knobs'].includes(source.promptControlView)
                ? source.promptControlView : 'knobs',
            visualizerMode: MODES.includes(source.visualizerMode) ? source.visualizerMode : 'frequency',
            masterVolume: clamp(source.masterVolume, 0, 1, 0.78),
            bufferSeconds: clamp(source.bufferSeconds, 0.25, 2, 0.65),
            midiEnabled: source.midiEnabled === true,
            midiInputId: text(source.midiInputId, '', 160),
            recordingDir: text(source.recordingDir, '', 500),
            recordingName: text(source.recordingName, 'Sonic Forge Session', 120)
        };
    }

    function currentRoot() {
        return window.EveAudioflixState?.ensure?.() || {};
    }

    function ensure() {
        const root = currentRoot();
        if (!root.soundLab
            || typeof root.soundLab !== 'object'
            || root.soundLab.schemaVersion !== 2
            || !['sliders', 'knobs'].includes(root.soundLab.controlView)
            || !['sliders', 'knobs'].includes(root.soundLab.promptControlView)) {
            root.soundLab = normalize(root.soundLab);
        }
        return root.soundLab;
    }

    function replace(raw, reason) {
        const next = normalize(raw);
        window.EveAudioflixState?.update?.({ soundLab: next }, reason || 'audioflix-soundlab');
        return next;
    }

    function update(patch, reason) {
        return replace(Object.assign({}, ensure(), patch || {}), reason);
    }

    function updatePrompt(promptId, patch) {
        const state = ensure();
        const prompts = state.prompts.map((prompt) => prompt.id === promptId
            ? cleanPrompt(Object.assign({}, prompt, patch), 0)
            : prompt);
        return update({ prompts, activePresetId: '' }, 'audioflix-soundlab-prompt');
    }

    function addPrompt() {
        const state = ensure();
        if (state.prompts.length >= 16) return state;
        const index = state.prompts.length;
        return update({
            prompts: [...state.prompts, cleanPrompt({
                id: id('prompt'),
                text: 'new musical direction',
                weight: 0.5,
                color: COLORS[index % COLORS.length],
                cc: 16 + index
            }, index)],
            activePresetId: ''
        }, 'audioflix-soundlab-add-prompt');
    }

    function removePrompt(promptId) {
        const state = ensure();
        if (state.prompts.length <= 1) return state;
        return update({
            prompts: state.prompts.filter((prompt) => prompt.id !== promptId),
            activePresetId: ''
        }, 'audioflix-soundlab-remove-prompt');
    }

    function savePreset(name) {
        const state = ensure();
        const preset = cleanPreset({
            id: id('preset'),
            name,
            prompts: state.prompts,
            config: state.config
        }, state.presets.length);
        return update({
            presets: [...state.presets, preset].slice(-24),
            activePresetId: preset.id
        }, 'audioflix-soundlab-save-preset');
    }

    function loadPreset(presetId) {
        const state = ensure();
        const preset = state.presets.find((entry) => entry.id === presetId);
        return preset ? update({
            prompts: cleanPrompts(preset.prompts),
            config: cleanConfig(preset.config),
            activePresetId: preset.id
        }, 'audioflix-soundlab-load-preset') : state;
    }

    function removePreset(presetId) {
        const state = ensure();
        return update({
            presets: state.presets.filter((preset) => preset.id !== presetId),
            activePresetId: state.activePresetId === presetId ? '' : state.activePresetId
        }, 'audioflix-soundlab-remove-preset');
    }

    Object.assign(ns, {
        ready: true,
        normalize,
        ensure,
        update,
        updatePrompt,
        addPrompt,
        removePrompt,
        savePreset,
        loadPreset,
        removePreset,
        scales: SCALES.slice(),
        modes: MODES.slice()
    });
})();
