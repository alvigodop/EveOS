'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const LAYERS = path.join(ROOT, 'js', 'modules', 'features', 'audioflix',
    'audioflix.audio.layers.js');
const ACTIONS = path.join(ROOT, 'js', 'modules', 'features', 'audioflix',
    'audioflix.ui.actions.js');
const NATIVE = path.join(ROOT, 'js', 'modules', 'features', 'audioflix', 'audioflix.native.js');
const WAVEFORM = path.join(ROOT, 'js', 'modules', 'features', 'audioflix',
    'audioflix.audio.waveform.js');

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

    let nativeMediaStops = 0;
    const nativeMediaController = window.EveAudioflixAudioLayers.createController({
        state: () => ({}),
        shouldPreferUrl: () => false,
        tryNativePlayback: async () => true,
        stopNativeItem: async () => { nativeMediaStops += 1; }
    });
    assert(await nativeMediaController.layerPlay({ id: 'native-media', type: 'music', url: 'media.wav' }),
        'successful native media layer starts');
    await Promise.allSettled(nativeMediaController.stopItemLayers('native-media'));
    assert(nativeMediaStops === 1, 'Stop owns and terminates a successful native media layer');

    const actionWindow = {
        EveAudioflixUiActions: {},
        EveAudioflixUiActionsLocalize: { create: () => async () => false },
        EveAudioflixUiActionsNexus: { create: () => async () => false },
        EveAudioflixSpotifyUi: { createActions: () => async () => false },
        EveAudioflixUiForms: { create: () => async () => false }
    };
    let actionLayerItem = null;
    let actionPlayItem = null;
    let actionPlayCount = 0;
    let actionLayerStopped = false;
    const hotkeyClear = deferred();
    const actionVoiceClears = [];
    actionWindow.EveAudioflixAudio = {
        layerPlay: async (item) => { actionLayerItem = item; return true; },
        playItem: async (item) => { actionPlayItem = item; actionPlayCount += 1; return true; },
        stopItemLayers: async () => { actionLayerStopped = true; return true; }
    };
    actionWindow.EveAudioflixNative = { clearVoices: (id) => { actionVoiceClears.push(id); return hotkeyClear.promise; } };
    const actionSandbox = { window: actionWindow, document: {}, Promise, console };
    vm.createContext(actionSandbox);
    vm.runInContext(fs.readFileSync(ACTIONS, 'utf8'), actionSandbox, { filename: ACTIONS });
    const actionHandler = actionWindow.EveAudioflixUiActions.create({
        findItem: () => ({ id: 'file-sound', url: 'clip.wav' }),
        portedSounds: [],
        stopRepeater: () => {}
    }).handleAction;
    await actionHandler({ dataset: { afAction: 'layer-play', afId: 'file-sound', afType: 'sound' } });
    assert(actionLayerItem?.type === 'sound', 'Layer Play preserves the UI sound type on file://');
    const pendingActionStop = actionHandler({
        dataset: { afAction: 'stop-item', afId: 'file-sound', afType: 'sound' }
    });
    await tick();
    assert(actionLayerStopped, 'visible Stop is not blocked by the file:// hotkey bridge request');
    assert(actionVoiceClears.includes('file-sound'), 'Stop clears a direct layer voice after browser state is lost');
    assert(actionVoiceClears.includes('hk:file-sound'), 'Stop also clears the global-hotkey voice');
    hotkeyClear.resolve(true);
    await pendingActionStop;

    actionLayerStopped = false;
    actionVoiceClears.length = 0;
    await actionHandler({ dataset: { afAction: 'play', afId: 'file-sound', afType: 'sound' } });
    assert(actionLayerStopped, 'normal Play first clears an existing layer owner for the same sound');
    assert(actionVoiceClears.includes('file-sound') && actionVoiceClears.includes('hk:file-sound'),
        'normal Play clears direct and hotkey owners before starting');
    assert(actionPlayCount === 1, 'one normal Play click creates exactly one playback owner');
    assert(actionPlayItem?.type === 'sound', 'normal Play preserves the UI sound type on file://');

    const analysers = [];
    const gains = [];
    const bufferSources = [];
    const node = () => ({
        connections: [],
        connect(target) { this.connections.push(target); return target; },
        disconnect() { this.disconnected = true; }
    });
    class FakeAudioContext {
        constructor() { this.destination = {}; this.state = 'running'; this.sampleRate = 48000; }
        createAnalyser() {
            const value = Object.assign(node(), {
                fftSize: 1024,
                frequencyBinCount: 512,
                getByteTimeDomainData() {}
            });
            analysers.push(value);
            return value;
        }
        createGain() {
            const value = Object.assign(node(), { gain: { value: 1 } });
            gains.push(value);
            return value;
        }
        createBufferSource() {
            const value = Object.assign(node(), {
                startArgs: null,
                stopCalls: 0,
                start(...args) { this.startArgs = args; },
                stop() { this.stopCalls += 1; }
            });
            bufferSources.push(value);
            return value;
        }
    }
    const waveformWindow = {
        EveAudioflixAudioWaveform: {},
        AudioContext: FakeAudioContext,
        requestAnimationFrame: () => 1,
        cancelAnimationFrame() {},
        devicePixelRatio: 1
    };
    const waveformSandbox = { window: waveformWindow, Uint8Array, WeakMap, WeakSet, console };
    vm.createContext(waveformSandbox);
    vm.runInContext(fs.readFileSync(WAVEFORM, 'utf8'), waveformSandbox, { filename: WAVEFORM });
    const waveform = waveformWindow.EveAudioflixAudioWaveform.createController(() => null);
    waveform.playBufferWaveform({ duration: 2 });
    assert(bufferSources.length === 1 && bufferSources[0].startArgs?.[1] === 0,
        'Soundboard visualization starts one analysis source at the requested offset');
    assert(analysers.length === 2 && bufferSources[0].connections[0] === analysers[1],
        'decoded Soundboard visualization uses a dedicated analyser');
    assert(gains.length === 2 && analysers[1].connections[0] === gains[1] && gains[1].gain.value === 0,
        'the visualizer analysis lane is silent instead of creating a second audible stream');
    assert(gains[0].gain.value === 1 && bufferSources[0].stopCalls === 0,
        'starting visualization does not disturb the shared Music Library output graph');
    waveform.stop();
    assert(bufferSources[0].stopCalls === 1,
        'Soundboard Stop terminates the visualizer buffer source instead of only hiding its drawing');

    const nativeSource = fs.readFileSync(NATIVE, 'utf8');
    assert(nativeSource.includes('allDevices = options.allDevices === true || (!!voiceId'),
        'specific voice cleanup requests all retained native output players');
    assert(nativeSource.includes('timeout: DEFAULT_TIMEOUT_MS, probe: true'),
        'user-initiated native Stop bypasses a stale bridge-offline cooldown');
    const backendProbe = spawnSync(process.env.PYTHON || 'python', ['-c', [
        'from server_modules import audioflix_bridge_playback as p',
        'class Fake:',
        '    def __init__(self): self.ids = []',
        '    def clear_voices(self, vid=None): self.ids.append(vid); return 1',
        'a, b = Fake(), Fake()',
        'p.sd = p.np = object()',
        'p._PLAYERS = {"sd:1:24000:1": a, "sd:2:48000:1": b}',
        'result = p.clear_voices({"deviceId": "sd:1", "voiceId": "clip", "allDevices": True})',
        'assert result["cleared"] == 2 and result["allDevices"] is True',
        'assert a.ids == ["clip"] and b.ids == ["clip"]',
        'import queue',
        'player = p._PcmPlayer.__new__(p._PcmPlayer)',
        'player.q, player.pending, player.flush_pending, player.stream_id = queue.Queue(), None, False, "owned-media"',
        'player.q.put(object())',
        'assert player.clear_stream("other-media") == 0 and player.q.qsize() == 1',
        'assert player.clear_stream("owned-media") == 1 and player.q.empty() and player.flush_pending',
        'assert player.stream_id is None'
    ].join('\n')], { cwd: ROOT, encoding: 'utf8' });
    assert(backendProbe.status === 0, `native all-device stop failed: ${backendProbe.stderr || backendProbe.stdout}`);

    const actions = fs.readFileSync(ACTIONS, 'utf8');
    const start = actions.indexOf("if (action === 'stop-item')");
    const end = actions.indexOf("if (action === 'toggle-repeater')", start);
    const stopBlock = actions.slice(start, end);
    const stopHelper = actions.slice(actions.indexOf('const stopItemPlayback'), actions.indexOf('async function handleAction'));
    assert(stopBlock.includes('stopItemPlayback') && stopHelper.includes('stopItemLayers'),
        'the visible Stop button reaches the layer controller');
    assert(!stopBlock.includes('EveAudioflixAudio?.pause'),
        'the layer Stop button cannot pause unrelated continuous playback');

    console.log('AUDIOFLIX_LAYER_STOP_SMOKE_OK');
}

main().catch((error) => { console.error(error); process.exit(1); });
