const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const timers = new Map();
const statuses = [];
const notices = [];
const storage = new Map([
    ['geminiConnectionEnabled', 'true'],
    ['geminiServerDesiredState', 'running']
]);
let timerId = 0;
let reconnectCalls = 0;
let reconcileCalls = 0;

class TestCustomEvent {
    constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
    }
}

const context = {
    console,
    AbortSignal,
    CustomEvent: TestCustomEvent,
    WebSocket: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 },
    location: { protocol: 'http:', origin: 'http://127.0.0.1:8765' },
    setTimeout(fn) {
        timerId += 1;
        timers.set(timerId, fn);
        return timerId;
    },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn) {
        timerId += 1;
        timers.set(timerId, fn);
        return timerId;
    },
    clearInterval(id) { timers.delete(id); },
    localStorage: {
        getItem(key) { return storage.has(key) ? storage.get(key) : null; },
        setItem(key, value) { storage.set(key, String(value)); },
        removeItem(key) { storage.delete(key); }
    },
    document: {
        readyState: 'loading',
        addEventListener() {},
        getElementById() { return null; }
    },
    dispatchEvent() {},
    updateConnectionStatus(status, message) { statuses.push({ status, message }); },
    displayMessage(message) { notices.push(message); },
    stopApplicationLevelPingPong() {},
    attemptConnection() { reconnectCalls += 1; }
};
context.window = context;
vm.createContext(context);

function runFile(relativePath) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    vm.runInContext(source, context, { filename: relativePath });
}

function fakeSocket() {
    return {
        readyState: context.WebSocket.OPEN,
        _connectionHealthInterval: 999
    };
}

async function main() {
    runFile('js/modules/gemini/client/connection_management/socket_core/socketGlobalState.js');
    runFile('js/modules/gemini/client/connection_management/socket_core/scc/eh/closeEventHandler.js');
    runFile('js/modules/gemini/client/connection_management/socket_core/serverStatusChecker.js');

    context.webSocket = fakeSocket();
    context.SocketConnectionCore.EventHandlers.handleClose({
        code: 4001,
        reason: 'Replaced by a newer interactive EveOS connection'
    });

    const state = context.SocketGlobalState;
    if (!state.sessionOwnershipTransferred || !state.serverOfflinePauseActive) {
        throw new Error('Intentional ownership transfer did not pause this EveOS window.');
    }
    if (timers.size !== 0 || state.reconnectAttempts !== 0 || reconnectCalls !== 0) {
        throw new Error('Intentional ownership transfer scheduled an automatic reconnect.');
    }
    if (!statuses.some((entry) => entry.message === 'Active in Another EveOS Window')) {
        throw new Error(`Ownership transfer status was not published: ${JSON.stringify(statuses)}`);
    }
    if (!notices.some((message) => /newer EveOS window/i.test(message))) {
        throw new Error('Ownership transfer guidance was not shown.');
    }

    await context.startContinuousReconnectAttempts();
    if (timers.size !== 0 || reconnectCalls !== 0) {
        throw new Error('Background server monitoring tried to steal transferred ownership.');
    }

    context.GeminiServerControlRuntime = {
        stateApi: {
            POLL_MS: 5000,
            RECOVERY_MIN_INTERVAL_MS: 12000,
            STATUS_GRACE_MS: 20000,
            state: { running: true, desiredRunning: true, serverState: 'running', busy: false },
            findController: async () => null,
            checkDirectServerStatus: async () => true,
            publish() {},
            readDesiredServerState: () => true,
            setDesiredServerState() {},
            setManualStop() {},
            isManualStopActive: () => false,
            setConnectionPreference() {},
            isConnectionPreferenceEnabled: () => true,
            shouldAutoRecoverDisabledConnection: () => false,
            syncCredentials: async () => ({ ok: true })
        },
        connectionApi: {
            reconcileClientConnection() { reconcileCalls += 1; },
            bootWorkspaceForConnection: async () => true,
            connectWhenWorkspaceReady() {},
            disconnectClient() {}
        }
    };
    runFile('js/modules/gemini/server_control/geminiServerControl.js');
    context.GeminiServerControl.setClientLink(true);
    if (state.sessionOwnershipTransferred || state.serverOfflinePauseActive) {
        throw new Error('Explicit connection action did not reclaim session ownership.');
    }
    if (reconcileCalls !== 1) {
        throw new Error(`Explicit ownership reclaim did not reconcile once: ${reconcileCalls}`);
    }

    context.webSocket = fakeSocket();
    context.SocketConnectionCore.EventHandlers.handleClose({ code: 1006, reason: 'network loss' });
    if (state.reconnectAttempts !== 1 || timers.size !== 1) {
        throw new Error('A real network interruption no longer schedules normal reconnect.');
    }

    console.log('GEMINI_SESSION_OWNERSHIP_SMOKE_OK');
}

main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
});
