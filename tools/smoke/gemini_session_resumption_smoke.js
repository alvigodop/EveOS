const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const storage = new Map();
const session = new Map();
const timers = new Map();
const statuses = [];
const notices = [];
const sent = [];
let timerId = 0;
let reconnects = 0;

const context = {
    console,
    Date,
    JSON,
    WebSocket: { OPEN: 1 },
    CustomEvent: class CustomEvent {},
    setInterval,
    clearInterval,
    setTimeout(fn, delay) {
        timerId += 1;
        timers.set(timerId, { fn, delay });
        return timerId;
    },
    clearTimeout(id) { timers.delete(id); },
    localStorage: {
        getItem: (key) => storage.has(key) ? storage.get(key) : null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: (key) => storage.delete(key)
    },
    sessionStorage: {
        getItem: (key) => session.has(key) ? session.get(key) : null,
        setItem: (key, value) => session.set(key, String(value)),
        removeItem: (key) => session.delete(key)
    },
    document: { getElementById: () => null },
    location: { protocol: 'http:', origin: 'http://127.0.0.1:8765' },
    dispatchEvent() {},
    updateConnectionStatus(status, message) { statuses.push({ status, message }); },
    displayMessage(message) { notices.push(String(message)); },
    stopApplicationLevelPingPong() {},
    attemptConnection() { reconnects += 1; },
    GeminiServerControl: { getState: () => ({ credentialsConfigured: true }) },
    EveGeminiModelRegistry: {
        migrateStorage() {},
        resolve: () => 'gemini-3.1-flash-live-preview'
    }
};
context.window = context;
vm.createContext(context);

function load(relativePath) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'), context, {
        filename: relativePath
    });
}

async function route(payload) {
    await context.handleSocketMessage({ data: JSON.stringify(payload) });
}

function runOnlyTimer(expectedDelay) {
    if (timers.size !== 1) throw new Error(`Expected one reconnect timer, found ${timers.size}.`);
    const [id, timer] = [...timers.entries()][0];
    timers.delete(id);
    if (timer.delay !== expectedDelay) throw new Error(`Expected ${expectedDelay}ms reconnect, got ${timer.delay}ms.`);
    timer.fn();
}

async function main() {
    storage.set('geminiConnectionEnabled', 'true');
    storage.set('geminiServerDesiredState', 'running');
    load('js/modules/gemini/client/connection_management/geminiSessionResumption.js');
    load('js/modules/gemini/client/connection_management/socket_core/socketGlobalState.js');
    load('js/modules/gemini/client/connection_management/socket_core/socketMessageRouter.js');
    load('js/modules/gemini/client/connection_management/socket_core/scc/eh/closeEventHandler.js');
    load('js/modules/gemini/client/connection_management/autoSetupHandler.js');

    await route({ type: 'session_resumption_update', resumable: true, handle: 'resume-1' });
    await route({ type: 'session_go_away', resumeAvailable: true, timeLeftSeconds: 15 });
    const state = context.SocketGlobalState;
    if (!state.plannedSessionRotation || state.shouldReplayContextAfterReconnect !== false) {
        throw new Error('GoAway did not prepare a non-destructive session rotation.');
    }
    if (context.EveGeminiSessionResumption.pendingHandle() !== 'resume-1') {
        throw new Error('The current resumable handle was not staged for reconnect.');
    }

    context.webSocket = { readyState: 1, _connectionHealthInterval: null };
    context.SocketConnectionCore.EventHandlers.handleClose({ code: 1008, reason: 'session rotation' });
    runOnlyTimer(150);
    if (reconnects !== 1 || notices.some((message) => /Connection lost - reconnecting/i.test(message))) {
        throw new Error('Planned rotation used the noisy exponential reconnect path.');
    }

    context.webSocket = { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) };
    await context.sendAutoSetupMessage();
    if (sent.at(-1)?.sessionResumptionHandle !== 'resume-1') {
        throw new Error('Auto setup did not forward the staged session handle.');
    }

    state.shouldReplayContextAfterReconnect = true;
    await route({ type: 'session_ready', text: 'Connected to Gemini Live', resumed: true });
    if (!state.geminiApiReady || state.shouldReplayContextAfterReconnect !== false
        || context.EveGeminiSessionResumption.pendingHandle()) {
        throw new Error('A resumed session did not suppress redundant context replay.');
    }

    await route({ type: 'session_resumption_update', resumable: true, handle: 'expired' });
    await route({ type: 'session_go_away', resumeAvailable: true });
    await route({ type: 'session_resumption_rejected', text: 'Resume rejected.' });
    if (!state.plannedSessionRotation || !state.resumptionFallbackPending
        || state.shouldReplayContextAfterReconnect !== true
        || context.EveGeminiSessionResumption.hasHandle()) {
        throw new Error('Expired-handle rejection did not stage one clean fallback session.');
    }

    timers.clear();
    context.webSocket = { readyState: 1, _connectionHealthInterval: null };
    context.SocketConnectionCore.EventHandlers.handleClose({ code: 1000, reason: 'clean fallback' });
    runOnlyTimer(150);
    if (reconnects !== 2 || state.shouldReplayContextAfterReconnect !== true) {
        throw new Error('Clean fallback did not retain context-recovery intent.');
    }

    console.log('GEMINI_SESSION_RESUMPTION_SMOKE_OK');
}

main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
});
