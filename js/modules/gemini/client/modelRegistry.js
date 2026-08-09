/**
 * Browser-side Gemini model policy.
 *
 * Preview model ids expire. All persisted or user-controlled model values must
 * pass through this registry before they are shown or sent to the backend.
 */
(function () {
    'use strict';

    const DEFAULTS = Object.freeze({
        live: 'gemini-3.1-flash-live-preview',
        textBrain: 'gemini-3.5-flash-lite',
        transcription: 'gemini-3.6-flash'
    });

    const MODELS = Object.freeze({
        live: Object.freeze([
            Object.freeze({
                id: 'gemini-3.1-flash-live-preview',
                label: 'Gemini 3.1 Flash Live Preview (recommended)',
                summary: 'Current low-latency Live audio model with native input and output transcription.',
                capabilities: Object.freeze({
                    audioOutput: true,
                    inputAudioTranscription: true,
                    outputAudioTranscription: true,
                    affectiveDialog: false,
                    proactiveAudio: false
                })
            }),
            Object.freeze({
                id: 'gemini-2.5-flash-native-audio-preview-12-2025',
                label: 'Gemini 2.5 Flash Native Audio (12-2025 fallback)',
                summary: 'Compatibility fallback with native transcription, affective dialog, and proactive audio.',
                capabilities: Object.freeze({
                    audioOutput: true,
                    inputAudioTranscription: true,
                    outputAudioTranscription: true,
                    affectiveDialog: true,
                    proactiveAudio: true
                })
            })
        ]),
        textBrain: Object.freeze([
            Object.freeze({
                id: 'gemini-3.5-flash-lite',
                label: 'Gemini 3.5 Flash-Lite (recommended)',
                summary: 'Fast, large-context extraction model for Mode 2 and EveOS context relay.',
                capabilities: Object.freeze({ textGeneration: true, largeContext: true })
            }),
            Object.freeze({
                id: 'gemini-3.5-flash',
                label: 'Gemini 3.5 Flash',
                summary: 'Higher-capability text-brain option with a larger quota cost.',
                capabilities: Object.freeze({ textGeneration: true, largeContext: true })
            }),
            Object.freeze({
                id: 'gemini-3.6-flash',
                label: 'Gemini 3.6 Flash',
                summary: 'Newest general Flash option for heavier extraction and reasoning turns.',
                capabilities: Object.freeze({ textGeneration: true, largeContext: true })
            }),
            Object.freeze({
                id: 'gemini-3.1-flash-lite',
                label: 'Gemini 3.1 Flash-Lite (compatibility fallback)',
                summary: 'Conservative fallback when newer text-brain models are unavailable.',
                capabilities: Object.freeze({ textGeneration: true, largeContext: true })
            })
        ]),
        transcription: Object.freeze([
            Object.freeze({
                id: 'gemini-3.6-flash',
                label: 'Gemini 3.6 Flash',
                summary: 'Fallback audio-file transcription model.',
                capabilities: Object.freeze({ audioInput: true, textGeneration: true })
            }),
            Object.freeze({
                id: 'gemini-3.5-flash',
                label: 'Gemini 3.5 Flash',
                summary: 'Compatibility fallback for audio-file transcription.',
                capabilities: Object.freeze({ audioInput: true, textGeneration: true })
            })
        ])
    });

    const MIGRATIONS = Object.freeze({
        live: Object.freeze({
            'gemini-2.5-flash-native-audio-latest': DEFAULTS.live,
            'gemini-2.5-flash-preview-native-audio-dialog': DEFAULTS.live,
            'gemini-2.5-flash-experimental-native-audio-thinking-dialog': DEFAULTS.live,
            'gemini-2.0-flash-live-001': DEFAULTS.live,
            'gemini-live-2.5-flash-preview': DEFAULTS.live
        }),
        textBrain: Object.freeze({
            'gemini-2.5-flash-lite': DEFAULTS.textBrain,
            'gemini-2.5-flash': 'gemini-3.5-flash',
            'gemini-2.5-pro': 'gemini-3.6-flash',
            'gemini-2.0-flash-lite': DEFAULTS.textBrain,
            'gemini-2.0-flash': 'gemini-3.5-flash'
        }),
        transcription: Object.freeze({
            'gemini-2.0-flash': DEFAULTS.transcription,
            'gemini-2.5-flash': DEFAULTS.transcription
        })
    });

    const STORAGE_BINDINGS = Object.freeze({
        selectedModel: 'live',
        textBrainModel: 'textBrain'
    });

    function modelList(kind) {
        return MODELS[kind] || [];
    }

    function resolve(kind, value) {
        const candidate = String(value || '').trim();
        const migrated = MIGRATIONS[kind]?.[candidate] || candidate;
        return modelList(kind).some(function (model) { return model.id === migrated; })
            ? migrated
            : DEFAULTS[kind];
    }

    function getModel(kind, value) {
        const id = resolve(kind, value);
        return modelList(kind).find(function (model) { return model.id === id; }) || null;
    }

    function getCapabilities(kind, value) {
        return Object.assign({}, getModel(kind, value)?.capabilities || {});
    }

    function getFallback(kind, value) {
        const models = modelList(kind);
        const selected = resolve(kind, value);
        const selectedIndex = models.findIndex(function (model) { return model.id === selected; });
        return selectedIndex >= 0 && selectedIndex + 1 < models.length
            ? models[selectedIndex + 1].id
            : '';
    }

    function migrateStorage(storage) {
        const target = storage || window.localStorage;
        const changes = [];
        Object.keys(STORAGE_BINDINGS).forEach(function (storageKey) {
            const kind = STORAGE_BINDINGS[storageKey];
            let previous = '';
            try { previous = String(target?.getItem?.(storageKey) || '').trim(); }
            catch (error) { return; }
            const next = resolve(kind, previous);
            if (previous === next) return;
            try { target?.setItem?.(storageKey, next); }
            catch (error) { return; }
            changes.push({ storageKey: storageKey, kind: kind, from: previous, to: next });
        });
        if (changes.length && typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
            window.dispatchEvent(new window.CustomEvent('eve:gemini-models-migrated', { detail: { changes: changes } }));
        }
        return changes;
    }

    function populateSelect(select, kind, value) {
        if (!select) return resolve(kind, value);
        const selected = resolve(kind, value);
        select.replaceChildren();
        modelList(kind).forEach(function (model) {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.label;
            option.selected = model.id === selected;
            select.appendChild(option);
        });
        select.value = selected;
        return selected;
    }

    window.EveGeminiModelRegistry = Object.freeze({
        defaults: DEFAULTS,
        models: MODELS,
        migrations: MIGRATIONS,
        resolve: resolve,
        getModel: getModel,
        getModels: function (kind) { return modelList(kind).slice(); },
        getFallback: getFallback,
        getCapabilities: getCapabilities,
        migrateStorage: migrateStorage,
        populateSelect: populateSelect
    });

    migrateStorage();
})();
