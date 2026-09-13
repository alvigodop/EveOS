const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const timers = new Map();
const storage = new Map([['geminiConnectionEnabled', 'true']]);
const statuses = [];
let timerId = 0;
let serverRunning = false;
let connectionAttempts = 0;

const context = {
    console: { log() {}, warn() {}, error: (...args) => console.error(...args) },
    AbortSignal,
    WebSocket: { OPEN: 1, CLOSED: 3 },
    setTimeout(fn) {
        timerId += 1;
        timers.set(timerId, fn);
        return timerId;
    },
    clearTimeout(id) {
        timers.delete(id);
    },
    setInterval(fn) {
        timerId += 1;
        timers.set(timerId, fn);
        return timerId;
    },
    clearInterval(id) {
        timers.delete(id);
    },
    localStorage: {
        getItem(key) {
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            storage.set(key, String(value));
        }
    },
    fetch: async () => ({
        ok: true,
        json: async () => ({ status: serverRunning ? 'running' : 'stopped' })
    }),
    updateConnectionStatus(status, message) {
        statuses.push({ status, message });
    },
    displayMessage() {},
    attemptConnection() {
        connectionAttempts += 1;
    }
};
context.window = context;
vm.createContext(context);

function runFile(relativePath) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    vm.runInContext(source, context, { filename: relativePath });
}

async function runNextTimer() {
    const next = timers.entries().next().value;
    if (!next) throw new Error('Expected a scheduled reconnect check.');
    timers.delete(next[0]);
    await next[1]();
    await Promise.resolve();
}

async function main() {
    runFile('js/modules/gemini/client/connection_management/socket_core/socketGlobalState.js');
    runFile('js/modules/gemini/client/connection_management/socket_core/serverStatusChecker.js');

    context.startContinuousReconnectAttempts();
    for (let index = 0; index < 9; index += 1) {
        await runNextTimer();
    }

    if (storage.get('geminiConnectionEnabled') !== 'true') {
        throw new Error('Temporary server downtime persisted a disabled Gemini preference.');
    }
    if (!context.SocketGlobalState.autoReconnectEnabled
        || context.SocketGlobalState.serverOfflinePauseActive) {
        throw new Error('Temporary server downtime disabled reconnect state.');
    }
    if (!statuses.some((entry) => /Offline - Monitoring/.test(entry.message))) {
        throw new Error(`Offline monitoring state was not published: ${JSON.stringify(statuses)}`);
    }

    serverRunning = true;
    await runNextTimer();
    if (connectionAttempts !== 1) {
        throw new Error(`Server recovery did not trigger reconnect: ${connectionAttempts}`);
    }

    context.SocketGlobalState.credentialRequired = true;
    await runNextTimer();
    await runNextTimer();
    if (connectionAttempts !== 1) {
        throw new Error(`Missing credentials caused a reconnect loop: ${connectionAttempts}`);
    }
    if (!statuses.some((entry) => entry.message === 'API Key Required')) {
        throw new Error(`Credential-required status was not preserved: ${JSON.stringify(statuses)}`);
    }

    context.SocketGlobalState.credentialRequired = false;
    await runNextTimer();
    if (connectionAttempts !== 2) {
        throw new Error(`Reconnect did not resume after credentials became available: ${connectionAttempts}`);
    }

    // A stopped headed localhost/link writes the disabled preference before its socket closes.
    // A stale desired-running bit must never override that explicit disabled state and create a
    // new background reconnect monitor (the prior logic turned it back on here).
    if (context.SocketGlobalState.continuousReconnectInterval) {
        context.clearTimeout(context.SocketGlobalState.continuousReconnectInterval);
        context.SocketGlobalState.continuousReconnectInterval = null;
    }
    storage.set('geminiConnectionEnabled', 'false');
    storage.set('geminiServerDesiredState', 'running');
    context.SocketGlobalState.autoReconnectEnabled = true;
    context.SocketGlobalState.serverOfflinePauseActive = false;
    const attemptsBeforeDisabled = connectionAttempts;
    await context.startContinuousReconnectAttempts();
    if (storage.get('geminiConnectionEnabled') !== 'false') {
        throw new Error('Disabled Gemini preference was overwritten by stale desired-running state.');
    }
    if (context.SocketGlobalState.autoReconnectEnabled
        || !context.SocketGlobalState.serverOfflinePauseActive
        || context.SocketGlobalState.continuousReconnectInterval) {
        throw new Error('Disabled Gemini link started a background reconnect monitor.');
    }
    if (connectionAttempts !== attemptsBeforeDisabled) {
        throw new Error('Disabled Gemini link attempted a socket connection.');
    }

    console.log('GEMINI_RECONNECT_PERSISTENCE_SMOKE_OK');
}

main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
});
