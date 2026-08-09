'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

function storage(initial = {}) {
    const values = { ...initial };
    return {
        values,
        getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem(key, value) { values[key] = String(value); },
        removeItem(key) { delete values[key]; }
    };
}

const localStorage = storage({ selectedModel: 'gemini-3.1-flash-live-preview' });
const sessionStorage = storage();
const messages = [];
const statuses = [];
const modelSelect = { value: '' };
const socket = {};

const state = {
    APPLICATION_PONG_MESSAGE: 'pong',
    autoReconnectEnabled: true,
    serverOfflinePauseActive: false,
    credentialRequired: false,
    apiPolicyBlocked: false,
    apiKeyInvalid: false,
    geminiApiReady: false,
    reconnectTimeout: null,
    continuousReconnectInterval: null
};

const sandbox = {
    console,
    JSON,
    Object,
    String,
    Number,
    Promise,
    setTimeout,
    clearTimeout,
    clearInterval,
    displayMessage: (message) => messages.push(message),
    updateConnectionStatus: (status, label) => statuses.push({ status, label }),
    document: {
        getElementById(id) {
            return id === 'modelSelectSess' ? modelSelect : null;
        }
    }
};
sandbox.window = {
    SocketGlobalState: state,
    localStorage,
    sessionStorage,
    webSocket: socket
};
sandbox.localStorage = localStorage;
sandbox.sessionStorage = sessionStorage;
sandbox.globalThis = sandbox.window;

for (const relativePath of [
    'js/modules/gemini/client/modelRegistry.js',
    'js/modules/gemini/client/connection_management/socket_core/geminiApiFailure.js',
    'js/modules/gemini/client/connection_management/socket_core/socketMessageRouter.js'
]) {
    const sourcePath = path.join(ROOT, relativePath);
    vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
}

async function route(text) {
    await sandbox.window.handleSocketMessage({
        data: JSON.stringify({ text, is_system_message: true }),
        target: socket,
        currentTarget: socket
    });
}

(async () => {
    const unavailable = 'models/gemini-3.1-flash-live-preview is not found for API version v1beta or is not supported for bidiGenerateContent';
    await route(unavailable);

    const fallback = 'gemini-2.5-flash-native-audio-preview-12-2025';
    assert(localStorage.values.selectedModel === fallback, 'recommended model advances to compatibility fallback');
    assert(modelSelect.value === fallback, 'Session Controls reflects fallback selection');
    assert(state.autoReconnectEnabled === true, 'first model fallback leaves reconnect enabled');
    assert(messages.some((message) => message.includes('Trying the registered compatibility model')), 'fallback is visible to the user');

    await route(unavailable);
    assert(localStorage.values.selectedModel === fallback, 'failed fallback does not ping-pong to the recommended model');
    assert(state.autoReconnectEnabled === false, 'exhausted model options pause automatic reconnect');
    assert(state.serverOfflinePauseActive === true, 'model exhaustion enters a stable paused state');
    assert(statuses.at(-1)?.label === 'Model Unavailable', 'terminal model failure has a specific status');

    console.log('GEMINI_LIVE_MODEL_FALLBACK_SMOKE_OK');
})().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
