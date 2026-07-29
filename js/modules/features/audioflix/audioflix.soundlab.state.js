window.EveAudioflixSoundLabState = window.EveAudioflixSoundLabState || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabState;
    if (ns.ready) return;

    const COLORS = ['#20e3b2', '#67b7ff', '#ffba55', '#ff6f91', '#c798ff', '#9fe870'];
    const MODE_LABELS = {
        spectrum: 'Spectrum (Log)',
        waveform: 'Waveform',
        radial: 'Radial Spectrum',
        spectrogram: 'Spectrogram',
        'frequency-linear': 'Frequency (Linear Legacy)'
    };
    const MODES = Object.keys(MODE_LABELS);
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

    function cleanEffects(effects) {
        const source = effects && typeof effects === 'object' ? effects : {};
        const filter = source.filter && typeof source.filter === 'object' ? source.filter : {};
        const delay = source.delay && typeof source.delay === 'object' ? source.delay : {};
        const reverb = source.reverb && typeof source.reverb === 'object' ? source.reverb : {};
        const stereo = source.stereo && typeof source.stereo === 'object' ? source.stereo : {};
        const limiter = source.limiter && typeof source.limiter === 'object' ? source.limiter : {};
        return {
            filter: {
                enabled: filter.enabled === true,
                type: ['lowpass', 'highpass', 'bandpass', 'notch'].includes(filter.type) ? filter.type : 'lowpass',
                frequency: clamp(filter.frequency, 40, 20000, 18000),
                q: clamp(filter.q, 0.1, 18, 0.7),
                mix: clamp(filter.mix, 0, 1, 1)
            },
            delay: {
                enabled: delay.enabled === true,
                time: clamp(delay.time, 0.01, 1.5, 0.24),
                feedback: clamp(delay.feedback, 0, 0.88, 0.22),
                mix: clamp(delay.mix, 0, 0.75, 0.12)
            },
            reverb: {
                enabled: reverb.enabled === true,
                decay: clamp(reverb.decay, 0.2, 8, 1.8),
                mix: clamp(reverb.mix, 0, 0.75, 0.1)
            },
            stereo: {
                enabled: stereo.enabled === true,
                width: clamp(stereo.width, 0, 1.5, 1)
            },
            limiter: {
                enabled: limiter.enabled !== false,
                threshold: clamp(limiter.threshold, -24, 0, -1),
                knee: clamp(limiter.knee, 0, 30, 6),
                ratio: clamp(limiter.ratio, 1, 20, 8),
                attack: clamp(limiter.attack, 0, 1, 0.003),
                release: clamp(limiter.release, 0.01, 1, 0.12)
            }
        };
    }

    function cleanMapping(mapping, fallbackDepth) {
        const source = mapping && typeof mapping === 'object' ? mapping : {};
        return {
            enabled: source.enabled === true,
            depth: clamp(source.depth, 0, 1, fallbackDepth)
        };
    }

    function cleanModulation(modulation) {
        const source = modulation && typeof modulation === 'object' ? modulation : {};
        return {
            enabled: source.enabled === true,
            smoothing: clamp(source.smoothing, 0, 0.98, 0.82),
            lowToFilter: cleanMapping(source.lowToFilter, 0.18),
            rmsToReverb: cleanMapping(source.rmsToReverb, 0.12),
            highToWidth: cleanMapping(source.highToWidth, 0.18)
        };
    }

    function cleanDiagnostics(diagnostics) {
        const source = diagnostics && typeof diagnostics === 'object' ? diagnostics : {};
        return {
            frequencyLabels: source.frequencyLabels !== false,
            beatGrid: source.beatGrid !== false,
            peakHold: source.peakHold !== false,
            showTelemetry: source.showTelemetry !== false
        };
    }

    function cleanContinuity(continuity) {
        const source = continuity && typeof continuity === 'object' ? continuity : {};
        return {
            autoReconnect: source.autoReconnect !== false,
            maxAttempts: Math.round(clamp(source.maxAttempts, 0, 8, 5))
        };
    }

    function cleanRender(render) {
        const source = render && typeof render === 'object' ? render : {};
        return {
            model: ['lyria-3-clip-preview', 'lyria-3-pro-preview'].includes(source.model)
                ? source.model : 'lyria-3-clip-preview',
            prompt: text(source.prompt, '', 1200),
            name: text(source.name, 'Sonic Forge Render', 120)
        };
    }

    function cleanScene(scene) {
        const source = scene && typeof scene === 'object' ? scene : {};
        return {
            prompts: cleanPrompts(source.prompts),
            config: cleanConfig(source.config),
            effects: cleanEffects(source.effects),
            modulation: cleanModulation(source.modulation),
            diagnostics: cleanDiagnostics(source.diagnostics),
            visualizerMode: normalizeVisualizerMode(source.visualizerMode),
            masterVolume: clamp(source.masterVolume, 0, 1, 0.78),
            bufferSeconds: clamp(source.bufferSeconds, 0.25, 2, 0.65)
        };
    }

    function cleanPreset(preset, index) {
        const source = preset && typeof preset === 'object' ? preset : {};
        return Object.assign({
            id: text(source.id, id('preset'), 80),
            name: text(source.name, `Preset ${index + 1}`, 80),
            createdAt: Number(source.createdAt || 0) || Date.now(),
            updatedAt: Number(source.updatedAt || 0) || Date.now()
        }, cleanScene(source));
    }

    function cleanPrompts(prompts) {
        const result = (Array.isArray(prompts) ? prompts : DEFAULT_PROMPTS)
            .slice(0, 16)
            .map(cleanPrompt)
            .filter((prompt) => !!prompt.text);
        return result.length ? result : DEFAULT_PROMPTS.map(cleanPrompt);
    }

    function normalizeVisualizerMode(value) {
        if (value === 'frequency') return 'spectrum';
        return MODES.includes(value) ? value : 'spectrum';
    }

    function normalize(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            schemaVersion: 3,
            prompts: cleanPrompts(source.prompts),
            config: cleanConfig(source.config),
            effects: cleanEffects(source.effects),
            modulation: cleanModulation(source.modulation),
            diagnostics: cleanDiagnostics(source.diagnostics),
            continuity: cleanContinuity(source.continuity),
            render: cleanRender(source.render),
            presets: (Array.isArray(source.presets) ? source.presets : []).slice(-24).map(cleanPreset),
            sceneSlots: {
                a: source.sceneSlots?.a ? cleanScene(source.sceneSlots.a) : null,
                b: source.sceneSlots?.b ? cleanScene(source.sceneSlots.b) : null
            },
            sceneMorphSeconds: clamp(source.sceneMorphSeconds, 0.5, 20, 4),
            activePresetId: text(source.activePresetId, '', 80),
            controlView: ['sliders', 'knobs'].includes(source.controlView) ? source.controlView : 'sliders',
            promptControlView: ['sliders', 'knobs'].includes(source.promptControlView)
                ? source.promptControlView : 'knobs',
            visualizerMode: normalizeVisualizerMode(source.visualizerMode),
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
            || root.soundLab.schemaVersion !== 3
            || !['sliders', 'knobs'].includes(root.soundLab.controlView)
            || !['sliders', 'knobs'].includes(root.soundLab.promptControlView)
            || !MODES.includes(root.soundLab.visualizerMode)) {
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
            ...cleanScene(state)
        }, state.presets.length);
        return update({
            presets: [...state.presets, preset].slice(-24),
            activePresetId: preset.id
        }, 'audioflix-soundlab-save-preset');
    }

    function loadPreset(presetId) {
        const state = ensure();
        const preset = state.presets.find((entry) => entry.id === presetId);
        return preset ? update(Object.assign(cleanScene(preset), {
            activePresetId: preset.id
        }), 'audioflix-soundlab-load-preset') : state;
    }

    function removePreset(presetId) {
        const state = ensure();
        return update({
            presets: state.presets.filter((preset) => preset.id !== presetId),
            activePresetId: state.activePresetId === presetId ? '' : state.activePresetId
        }, 'audioflix-soundlab-remove-preset');
    }

    function captureSceneSlot(slot) {
        const key = slot === 'b' ? 'b' : 'a';
        const state = ensure();
        return update({
            sceneSlots: Object.assign({}, state.sceneSlots, { [key]: cleanScene(state) })
        }, `audioflix-soundlab-scene-${key}-capture`);
    }

    function applySceneSlot(slot) {
        const key = slot === 'b' ? 'b' : 'a';
        const state = ensure();
        return state.sceneSlots?.[key]
            ? update(Object.assign(cleanScene(state.sceneSlots[key]), { activePresetId: '' }),
                `audioflix-soundlab-scene-${key}-apply`)
            : state;
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
        captureSceneSlot,
        applySceneSlot,
        cleanEffects,
        cleanModulation,
        cleanScene,
        snapshotScene: () => cleanScene(ensure()),
        scales: SCALES.slice(),
        modes: MODES.slice(),
        modeLabel: (mode) => MODE_LABELS[mode] || String(mode || '')
    });
})();
