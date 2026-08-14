window.EveAudioflixSoundLabReferenceScenes = window.EveAudioflixSoundLabReferenceScenes || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabReferenceScenes;
    if (ns.ready) return;

    const PROMPTS = [
        ['Bossa Nova', '#20e3b2', 1],
        ['Lush Strings', '#67b7ff', 0.34],
        ['Sparkling Arpeggios', '#ffba55', 0.24],
        ['Punchy Kick', '#ff6f91', 0.18]
    ];

    function promptDjStarter() {
        const state = window.EveAudioflixSoundLabState?.ensure?.() || {};
        return {
            prompts: PROMPTS.map(([text, color, weight], index) => ({
                id: `promptdj_${text.toLowerCase().replace(/\s+/g, '_')}`,
                text,
                color,
                weight,
                cc: 16 + index,
                locked: index === 0
            })),
            config: Object.assign({}, state.config || {}, {
                guidance: 4,
                temperature: 1.1,
                topK: 40,
                autoParams: { bpm: true, density: true, brightness: true },
                lockedParams: {}
            }),
            activePresetId: '',
            promptControlView: 'focus'
        };
    }

    Object.assign(ns, { ready: true, promptDjStarter });
})();
