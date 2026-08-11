'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const LAYERS = path.join(ROOT, 'js', 'modules', 'features', 'audioflix',
    'audioflix.audio.layers.js');
const ACTIONS = path.join(ROOT, 'js', 'modules', 'features', 'audioflix',
    'audioflix.ui.actions.js');

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

function tick() {
    return new Promise((resolve) => setImmediate(resolve));
}

async function main() {
    const players = [];
    const clearedVoices = [];
    let playVoiceResult = Promise.resolve(true);

    class FakeAudio {
        constructor() {
            this.currentTime = 0;
            this.paused = false;
            this.listeners = {};
            players.push(this);
        }
        addEventListener(name, callback) { this.listeners[name] = callback; }
        play() { return Promise.resolve(); }
        pause() { this.paused = true; }
    }

    const window = {
        EveAudioflixAudioLayers: {},
        EveAudioflixAudioSource: { needsResolution: () => false },
        EveAudioflixState: { normalizeVolume: (value, fallback) => Number(value ?? fallback) },
        EveAudioflixAudio: { getWaveformController: () => null },
        EveAudioflixNative: {
            shouldSuppressBrowserPlayback: () => true,
            playVoice: () => playVoiceResult,
            clearVoices: async (id) => { clearedVoices.push(id); }
        }
    };
    const sandbox = { window, Audio: FakeAudio, Map, Promise, console };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(LAYERS, 'utf8'), sandbox, { filename: LAYERS });

    const decoded = deferred();
    const controller = window.EveAudioflixAudioLayers.createController({
        state: () => ({}),
        shouldPreferUrl: () => false,
        tryNativePlayback: async () => false,
        getDecodedBuffer: () => decoded.promise,
        encodeBufferToBase64: () => 'pcm'
    });
    const pendingDecode = controller.layerPlay({ id: 'delayed-decode', url: 'file.mp3' });
    controller.stopItemLayers('delayed-decode');
    decoded.resolve({ sampleRate: 48000 });
    assert(await pendingDecode === false, 'Stop cancels a layer still waiting for decode');
    assert(clearedVoices.length === 0, 'cancelled decode never reaches native playback');

    const voice = deferred();
    playVoiceResult = voice.promise;
    const nativeController = window.EveAudioflixAudioLayers.createController({
        state: () => ({}),
        shouldPreferUrl: () => false,
        tryNativePlayback: async () => false,
        getDecodedBuffer: async () => ({ sampleRate: 48000 }),
        encodeBufferToBase64: () => 'pcm'
    });
    const pendingVoice = nativeController.layerPlay({ id: 'delayed-voice', url: 'voice.mp3' });
    await tick();
    nativeController.stopItemLayers('delayed-voice');
    voice.resolve(true);
    assert(await pendingVoice === false, 'Stop cancels a layer while native playback starts');
    assert(clearedVoices.includes('delayed-voice'), 'late native playback is explicitly cleared');

    window.EveAudioflixNative.shouldSuppressBrowserPlayback = () => false;
    const browserController = window.EveAudioflixAudioLayers.createController({
        state: () => ({}),
        shouldPreferUrl: () => false,
        tryNativePlayback: async () => false
    });
    await browserController.layerPlay({ id: 'layer-a', url: 'a.mp3' });
    await browserController.layerPlay({ id: 'layer-b', url: 'b.mp3' });
    const playerA = players.find((player) => player.src === 'a.mp3');
    const playerB = players.find((player) => player.src === 'b.mp3');
    browserController.stopItemLayers('layer-a');
    assert(playerA?.paused && playerA.currentTime === 0, 'the requested browser layer stops and rewinds');
    assert(playerB && !playerB.paused, 'stopping one layer leaves unrelated layers playing');

    const actions = fs.readFileSync(ACTIONS, 'utf8');
    const start = actions.indexOf("if (action === 'stop-item')");
    const end = actions.indexOf("if (action === 'toggle-repeater')", start);
    const stopBlock = actions.slice(start, end);
    assert(stopBlock.includes('stopItemLayers'), 'the visible Stop button reaches the layer controller');
    assert(!stopBlock.includes('EveAudioflixAudio?.pause'),
        'the layer Stop button cannot pause unrelated continuous playback');

    console.log('AUDIOFLIX_LAYER_STOP_SMOKE_OK');
}

main().catch((error) => { console.error(error); process.exit(1); });
