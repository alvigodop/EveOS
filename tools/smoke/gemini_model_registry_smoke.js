'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'js/modules/gemini/client/modelRegistry.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

const values = {
    selectedModel: 'gemini-2.5-flash-native-audio-latest',
    textBrainModel: 'gemini-2.5-flash-lite'
};
const events = [];
const sandbox = {
    console,
    Object,
    String,
    CustomEvent: class CustomEvent {
        constructor(type, init = {}) {
            this.type = type;
            this.detail = init.detail;
        }
    }
};
sandbox.window = {
    CustomEvent: sandbox.CustomEvent,
    dispatchEvent: (event) => events.push(event),
    localStorage: {
        getItem: (key) => values[key] ?? null,
        setItem: (key, value) => { values[key] = String(value); }
    }
};
sandbox.globalThis = sandbox.window;

vm.runInNewContext(source, sandbox, { filename: SOURCE_PATH });

const registry = sandbox.window.EveGeminiModelRegistry;
assert(registry, 'model registry was exported');
assert(values.selectedModel === 'gemini-3.1-flash-live-preview', 'retired Live id migrated');
assert(values.textBrainModel === 'gemini-3.5-flash-lite', 'retired text-brain id migrated');
assert(events.length === 1 && events[0].type === 'eve:gemini-models-migrated', 'migration event emitted once');
assert(events[0].detail.changes.length === 2, 'both persisted ids reported');

assert(registry.resolve('live', 'not-a-model') === registry.defaults.live, 'unknown Live id uses default');
assert(registry.resolve('textBrain', 'gemini-2.5-pro') === 'gemini-3.6-flash', 'known text alias migrated');
assert(registry.getModels('live').length === 2, 'Live allowlist stays bounded');
assert(registry.getFallback('live', registry.defaults.live) === 'gemini-2.5-flash-native-audio-preview-12-2025',
    'recommended Live model has one ordered compatibility fallback');
assert(registry.getFallback('live', 'gemini-2.5-flash-native-audio-preview-12-2025') === '',
    'last Live model has no fallback and cannot form a retry loop');
assert(registry.getModels('textBrain').some((model) => model.id === 'gemini-3.5-flash-lite'), 'current text model exposed');
assert(registry.getCapabilities('live', registry.defaults.live).outputAudioTranscription === true,
    'default Live model advertises native output transcription');
assert(registry.getCapabilities('live', registry.defaults.live).proactiveAudio === false,
    'unsupported default Live capability is not advertised');
assert(registry.defaults.music === 'models/lyria-realtime-exp', 'current Lyria model is centralized');
assert(registry.apiVersions.music === 'v1beta', 'Lyria RealTime uses the current SDK API contract');
assert(registry.apiVersionFallbacks.music.join(',') === 'v1alpha',
    'Lyria keeps one ordered compatibility endpoint without a retry loop');
assert(registry.apiVersions.live === 'v1beta', 'Live conversation keeps its independent API contract');
assert(registry.getModels('music').length === 1, 'experimental music model allowlist stays bounded');
assert(registry.getCapabilities('music', registry.defaults.music).liveSteering === true,
    'Lyria advertises live steering');

console.log('GEMINI_MODEL_REGISTRY_SMOKE_OK');
