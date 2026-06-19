const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const timers = new Map();
let timerId = 0;
let memoryEnabled = true;
let sends = [];
let messages = [];
let relayReplays = 0;

function makeMessage(classes, content, timestamp) {
    return {
        classList: { contains: (name) => classes.includes(name) },
        querySelector(selector) {
            if (selector === '.message-content') return { textContent: content };
            if (selector === '.message-timestamp') return { textContent: timestamp || '' };
            return null;
        },
        textContent: content
    };
}

const storage = new Map([['contextMemoryEnabled', 'true']]);
const context = {
    console,
    WebSocket: { OPEN: 1 },
    setTimeout(fn) {
        timerId += 1;
        timers.set(timerId, fn);
        return timerId;
    },
    clearTimeout(id) {
        timers.delete(id);
    },
    localStorage: {
        getItem(key) { return storage.has(key) ? storage.get(key) : null; },
        setItem(key, value) { storage.set(key, String(value)); },
        removeItem(key) { storage.delete(key); }
    },
    document: {
        getElementById(id) {
            if (id === 'contextMemoryToggle') return { checked: memoryEnabled };
            if (id === 'chatLog') {
                return {
                    querySelectorAll(selector) {
                        if (selector === '.chat-message') {
                            return [
                                makeMessage(['user-message'], 'hello context', '1:00 PM'),
                                makeMessage(['gemini-message'], 'hello user', '1:01 PM')
                            ];
                        }
                        return [];
                    }
                };
            }
            return null;
        }
    },
    webSocket: {
        readyState: 1,
        send(payload) { sends.push(JSON.parse(payload)); }
    },
    SocketGlobalState: {
        shouldReplayContextAfterReconnect: true,
        credentialRequired: false,
        geminiApiReady: true
    },
    ConversationMemoryAgentic: {
        isContextMemoryEnabled: () => memoryEnabled
    },
    GeminiLiveLinkAgentic: {
        replayLastContext: async () => {
            relayReplays += 1;
            return true;
        }
    },
    displayMessage(text) {
        messages.push(text);
    }
};
context.window = context;
vm.createContext(context);

function runFile(relativePath) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    vm.runInContext(source, context, { filename: relativePath });
}

async function flushOneTimer() {
    const entry = timers.entries().next().value;
    if (!entry) throw new Error('Expected a queued replay timer.');
    timers.delete(entry[0]);
    await entry[1]();
    await Promise.resolve();
}

async function main() {
    runFile('js/modules/gemini/client/connection_management/autoSetupHandler.js');

    memoryEnabled = false;
    context.SocketGlobalState.shouldReplayContextAfterReconnect = true;
    context.scheduleGeminiPostReconnectContextReplay('api-ready');
    if (timers.size !== 0 || sends.length !== 0 || relayReplays !== 0) {
        throw new Error('Memory-off replay should not queue or send context.');
    }
    if (context.SocketGlobalState.shouldReplayContextAfterReconnect !== false) {
        throw new Error('Memory-off replay did not clear the pending replay flag.');
    }
    if (!messages.some((line) => /clean context/.test(line))) {
        throw new Error('Memory-off reconnect did not announce clean context mode.');
    }

    memoryEnabled = true;
    context.SocketGlobalState.shouldReplayContextAfterReconnect = true;
    context.scheduleGeminiPostReconnectContextReplay('queued');
    memoryEnabled = false;
    await flushOneTimer();
    if (sends.length !== 0 || relayReplays !== 0) {
        throw new Error('Replay sent context after Memory Relay was disabled while queued.');
    }
    if (context.SocketGlobalState.shouldReplayContextAfterReconnect !== false) {
        throw new Error('Queued memory-off replay did not clear the pending replay flag.');
    }

    memoryEnabled = true;
    messages = [];
    context.SocketGlobalState.shouldReplayContextAfterReconnect = true;
    context.SocketGlobalState._lastContextReplayAt = 0;
    context.scheduleGeminiPostReconnectContextReplay('enabled');
    await flushOneTimer();
    if (!sends.some((payload) => payload.is_reconnect_replay)) {
        throw new Error('Memory-on replay did not send recent chat history.');
    }
    if (relayReplays !== 1) {
        throw new Error(`Memory-on replay did not replay the last EveOS context once: ${relayReplays}`);
    }
    if (context.SocketGlobalState.shouldReplayContextAfterReconnect !== false) {
        throw new Error('Memory-on replay did not clear the pending replay flag.');
    }

    console.log('GEMINI_RECONNECT_MEMORY_GATE_SMOKE_OK');
}

main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
});