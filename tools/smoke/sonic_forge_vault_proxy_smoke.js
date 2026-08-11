'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const PROXY = path.join(ROOT, 'js', 'modules', 'features', 'audioflix',
    'audioflix.soundlab.proxy.js');
const HANDLER = path.join(ROOT, 'server', 'gemini-backend', 'interactions',
    'main_server_files', 'websocket_server', 'gemini_session_handler.py');
const RELAY = path.join(ROOT, 'server', 'gemini-backend', 'interactions',
    'main_server_files', 'websocket_server', 'session_handler', 'sonic_forge_session.py');

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class FakeSocket {
    static OPEN = 1;
    static instances = [];

    constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.sent = [];
        this.listeners = new Map();
        FakeSocket.instances.push(this);
    }

    addEventListener(name, callback) {
        if (!this.listeners.has(name)) this.listeners.set(name, []);
        this.listeners.get(name).push(callback);
    }

    emit(name, payload = {}) {
        for (const callback of this.listeners.get(name) || []) callback(payload);
    }

    open() {
        this.readyState = FakeSocket.OPEN;
        this.emit('open');
    }

    message(payload) {
        this.emit('message', { data: JSON.stringify(payload) });
    }

    send(payload) {
        this.sent.push(JSON.parse(payload));
    }

    close() {
        this.readyState = 3;
        this.emit('close', { code: 1000, reason: '', wasClean: true });
    }
}

async function main() {
    const messages = [];
    const sandbox = {
        WebSocket: FakeSocket,
        Error,
        JSON,
        Object,
        Promise,
        window: {
            SocketGlobalState: { WS_URL: 'ws://127.0.0.1:9085' },
            EveAudioflixSoundLabProxy: {}
        }
    };
    sandbox.window.WebSocket = FakeSocket;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(PROXY, 'utf8'), sandbox, { filename: PROXY });

    const connecting = sandbox.window.EveAudioflixSoundLabProxy.connect({
        model: 'models/lyria-realtime-exp',
        callbacks: { onmessage: (message) => messages.push(message) }
    });
    const socket = FakeSocket.instances.at(-1);
    assert(socket?.url === 'ws://127.0.0.1:9085', 'the proxy uses the shared Gemini WebSocket');

    socket.open();
    assert(socket.sent[0]?.sessionRole === 'sonic_forge', 'the initial frame selects the isolated role');
    assert(socket.sent[0]?.model === 'models/lyria-realtime-exp', 'the selected music model is explicit');
    assert(!Object.hasOwn(socket.sent[0], 'apiKey'), 'the browser never sends a vault API key');

    socket.message({ type: 'sonic_forge_ready', model: 'models/lyria-realtime-exp' });
    const session = await connecting;
    assert(messages.some((message) => message.setupComplete), 'backend readiness maps to SDK setup');

    await session.setWeightedPrompts({ weightedPrompts: [{ text: 'ambient', weight: 1 }] });
    await session.setMusicGenerationConfig({ musicGenerationConfig: { bpm: 90 } });
    await session.play();
    await session.pause();
    await session.stop();
    await session.resetContext();
    assert(socket.sent.slice(1).map((message) => message.action).join(',') ===
        'set_weighted_prompts,set_music_generation_config,play,pause,stop,reset_context',
    'all Sonic Forge controls cross the proxy in order');

    socket.message({ type: 'sonic_forge_message', message: { serverContent: { audioChunks: [] } } });
    assert(messages.at(-1)?.serverContent, 'model messages return through the same callback contract');

    const handler = fs.readFileSync(HANDLER, 'utf8');
    const relay = fs.readFileSync(RELAY, 'utf8');
    const vaultLoad = handler.indexOf('refreshed_client = initialize_api_client()');
    const roleBranch = handler.indexOf('session_role == "sonic_forge"');
    assert(vaultLoad >= 0 && roleBranch > vaultLoad,
        'the backend opens the encrypted vault before entering the Sonic Forge role');
    assert(relay.includes('client.aio.live.music.connect'), 'the relay uses the current async music API');
    assert(relay.includes('model_dump(by_alias=True'), 'relay responses preserve browser-facing aliases');

    console.log('SONIC_FORGE_VAULT_PROXY_SMOKE_OK');
}

main().catch((error) => { console.error(error); process.exit(1); });
