// Full audit preparation. Only immutable JSON crosses a cooperative task boundary.
(function () {
    'use strict';

    async function prepare({ store, codec, captureStructure, checkpoint, measure }) {
        if (typeof store?.captureStateSections === 'function') {
            const parts = measure('captureStateMs', () => new Map(store.captureStateSections()));
            for (const key of ['metadata', 'bookmarks', 'library', 'knowledge', 'audioflix']) {
                if (typeof parts.get(key) !== 'string') throw new Error('Incomplete owned capture sections');
            }
            if (!await checkpoint()) return null;
            const audioflix = measure('receiptParseMs', () => JSON.parse(parts.get('audioflix')));
            if (!await checkpoint()) return null;
            const structure = measure('captureStructureMs', () => audioflix ? captureStructure(audioflix) : null);
            if (!await checkpoint()) return null;
            parts.set('audioflixStructure', measure('structureJsonMs', () => JSON.stringify(structure || null)));
            const json = measure('assembleMs', () => '{' + Array.from(parts,
                ([key, raw]) => JSON.stringify(key) + ':' + raw).join(',') + '}');
            if (!await checkpoint()) return null;
            return { parts, json };
        }
        // Legacy captureState may contain shallow config aliases. Seal before yielding.
        if (typeof store?.captureState !== 'function') return null;
        const state = measure('captureStateMs', () => store.captureState());
        const json = measure('stateJsonMs', () => JSON.stringify(state));
        if (typeof json !== 'string') return null;
        if (!await checkpoint()) return null;
        const parts = measure('splitMs', () => codec.splitObject(json));
        if (!await checkpoint()) return null;
        return { parts, json };
    }

    window.EveModularCaptureFull = Object.freeze({ prepare });
})();
