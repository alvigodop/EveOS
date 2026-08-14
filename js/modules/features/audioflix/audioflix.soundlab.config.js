// Sonic Forge generation config: defaults, sanitising, and the payload actually sent to Lyria.
//
// Split out of audioflix.soundlab.state.js to keep that module under the project line cap. It owns
// one idea — what a valid generation config is — so the "auto means the key is absent" rule lives
// in a single pure function that tests can assert without a live session.
window.EveAudioflixSoundLabConfig = window.EveAudioflixSoundLabConfig || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabConfig;
    if (ns.ready) return;

    // Exactly the fields Lyria infers when omitted. Per the Lyria RealTime docs: "For bpm, density,
    // brightness and scale, if no value is provided, the model will decide what's best according to
    // your initial prompts." scale is handled through its own SCALE_UNSPECIFIED option, which the
    // payload builder already prunes, so it is auto by selecting "Model decides" in the dropdown.
    //
    // guidance / temperature / topK are NOT on that list. They have fixed API defaults (4.0, 1.1, 40),
    // so omitting them means "use the API default", not "decide musically" — offering an auto pill
    // there would misdescribe what it does. Drift (soundlab.drift) automates them instead.
    const AUTO_PARAM_KEYS = ['bpm', 'density', 'brightness'];
    const LOCKABLE_PARAM_KEYS = [
        'bpm', 'density', 'brightness', 'guidance', 'temperature', 'topK'
    ];

    // bpm and scale changes force resetContext() (an audible discontinuity), so they must never be
    // driven continuously. Exported so the steering layer and its tests share one list instead of
    // each re-deciding it.
    const RESET_ON_CHANGE_KEYS = ['bpm', 'scale'];

    const SCALES = [
        'SCALE_UNSPECIFIED', 'C_MAJOR_A_MINOR', 'D_FLAT_MAJOR_B_FLAT_MINOR', 'D_MAJOR_B_MINOR',
        'E_FLAT_MAJOR_C_MINOR', 'E_MAJOR_D_FLAT_MINOR', 'F_MAJOR_D_MINOR',
        'G_FLAT_MAJOR_E_FLAT_MINOR', 'G_MAJOR_E_MINOR', 'A_FLAT_MAJOR_F_MINOR',
        'A_MAJOR_G_FLAT_MINOR', 'B_FLAT_MAJOR_G_MINOR', 'B_MAJOR_A_FLAT_MINOR'
    ];

    const MODES = ['QUALITY', 'DIVERSITY', 'VOCALIZATION'];

    const DEFAULTS = {
        bpm: 96,
        density: 0.42,
        brightness: 0.45,
        // Google's documented realtime defaults are the neutral baseline. Presets can tighten
        // these values deliberately without a fresh install silently biasing Lyria.
        // Legacy configs are migrated through the state normalizer.
        guidance: 4,
        temperature: 1.1,
        topK: 40,
        seed: 0,
        scale: 'SCALE_UNSPECIFIED',
        musicGenerationMode: 'QUALITY',
        muteBass: false,
        muteDrums: false,
        onlyBassAndDrums: false,
        autoParams: { bpm: false, density: false, brightness: false },
        lockedParams: {}
    };

    function clamp(value, min, max, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
    }

    function cleanAutoParams(value) {
        const source = value && typeof value === 'object' ? value : {};
        const out = {};
        AUTO_PARAM_KEYS.forEach((key) => { out[key] = source[key] === true; });
        return out;
    }

    function cleanLockedParams(value) {
        const source = value && typeof value === 'object' ? value : {};
        const out = {};
        LOCKABLE_PARAM_KEYS.forEach((key) => { out[key] = source[key] === true; });
        return out;
    }

    function cleanConfig(config) {
        const source = config && typeof config === 'object' ? config : {};
        const lockedParams = cleanLockedParams(source.lockedParams);
        const autoParams = cleanAutoParams(source.autoParams);
        AUTO_PARAM_KEYS.forEach((key) => {
            if (lockedParams[key]) autoParams[key] = false;
        });
        return {
            bpm: Math.round(clamp(source.bpm, 60, 200, DEFAULTS.bpm)),
            density: clamp(source.density, 0, 1, DEFAULTS.density),
            brightness: clamp(source.brightness, 0, 1, DEFAULTS.brightness),
            guidance: clamp(source.guidance, 0, 6, DEFAULTS.guidance),
            temperature: clamp(source.temperature, 0, 3, DEFAULTS.temperature),
            topK: Math.round(clamp(source.topK, 1, 1000, DEFAULTS.topK)),
            seed: Math.max(0, Math.round(clamp(source.seed, 0, 2147483647, 0))),
            scale: SCALES.includes(source.scale) ? source.scale : 'SCALE_UNSPECIFIED',
            musicGenerationMode: MODES.includes(source.musicGenerationMode)
                ? source.musicGenerationMode : 'QUALITY',
            muteBass: source.muteBass === true,
            muteDrums: source.muteDrums === true,
            onlyBassAndDrums: source.onlyBassAndDrums === true,
            autoParams,
            lockedParams
        };
    }

    // The payload actually handed to setMusicGenerationConfig. A parameter flagged auto is DELETED
    // rather than sent with a number: the SDK passes musicGenerationConfig through verbatim and
    // JSON.stringify drops absent keys, so omission is what reaches the wire. autoParams itself is
    // EveOS bookkeeping and never sent.
    function toWireConfig(config) {
        const clean = cleanConfig(config);
        const auto = clean.autoParams;
        const wire = Object.assign({}, clean);
        delete wire.autoParams;
        delete wire.lockedParams;
        AUTO_PARAM_KEYS.forEach((key) => { if (auto[key]) delete wire[key]; });
        return wire;
    }

    Object.assign(ns, {
        ready: true,
        DEFAULTS,
        SCALES: SCALES.slice(),
        MODES: MODES.slice(),
        cleanConfig,
        cleanAutoParams,
        cleanLockedParams,
        toWireConfig,
        autoParamKeys: () => AUTO_PARAM_KEYS.slice(),
        lockableParamKeys: () => LOCKABLE_PARAM_KEYS.slice(),
        resetOnChangeKeys: () => RESET_ON_CHANGE_KEYS.slice(),
        isAutoable: (key) => AUTO_PARAM_KEYS.includes(String(key || '')),
        // Guard for anything that wants to move a parameter continuously: a key that forces a
        // context reset must be refused rather than modulated.
        isSafeToModulate: (key) => !RESET_ON_CHANGE_KEYS.includes(String(key || ''))
    });
})();
