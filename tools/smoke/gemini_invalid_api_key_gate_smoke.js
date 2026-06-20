const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function loadScript(context, relativePath) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    vm.runInContext(source, context, { filename: relativePath });
}

async function main() {
    const statuses = [];
    const messages = [];
    const context = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        WebSocket: { OPEN: 1 },
        window: {},
        document: {
            getElementById() {
                return null;
            }
        },
        localStorage: {
            values: new Map([['geminiServerDesiredState', 'running']]),
            getItem(key) {
                return this.values.has(key) ? this.values.get(key) : null;
            },
            setItem(key, value) {
                this.values.set(key, String(value));
            },
            removeItem(key) {
                this.values.delete(key);
            }
        },
        updateConnectionStatus(status, message) {
            statuses.push({ status, message });
        },
        displayMessage(message) {
            messages.push(String(message));
        },
    };
    context.window = context;
    context.window.SocketGlobalState = {
        APPLICATION_PONG_MESSAGE: 'pong',
        credentialRequired: false,
        apiPolicyBlocked: false,
        apiKeyInvalid: false,
        geminiApiReady: true,
        autoReconnectEnabled: true,
        serverOfflinePauseActive: false,
        reconnectTimeout: setTimeout(() => {}, 5000),
        continuousReconnectInterval: setTimeout(() => {}, 5000),
    };
    context.window.SocketConnectionCore = { EventHandlers: {} };
    vm.createContext(context);

    loadScript(context, 'js/modules/gemini/client/connection_management/socket_core/socketMessageRouter.js');
    loadScript(context, 'js/modules/gemini/client/connection_management/socket_core/scc/eh/closeEventHandler.js');

    await context.window.handleSocketMessage({
        data: JSON.stringify({
            text: 'Error connecting to Gemini API: API error (received 1007 (invalid frame payload data) api key not valid. please pass a valid api key.)',
            is_system_message: true,
            is_error: true,
        })
    });

    const state = context.window.SocketGlobalState;
    if (!state.credentialRequired || !state.apiKeyInvalid || state.apiPolicyBlocked) {
        throw new Error(`Invalid API key was not classified correctly: ${JSON.stringify(state)}`);
    }
    if (state.autoReconnectEnabled || !state.serverOfflinePauseActive) {
        throw new Error(`Reconnect was not paused for invalid API key: ${JSON.stringify(state)}`);
    }
    if (state.reconnectTimeout || state.continuousReconnectInterval) {
        throw new Error('Reconnect timers were not cleared for invalid API key.');
    }
    if (!statuses.some((entry) => entry.status === 'error' && entry.message === 'API Key Invalid')) {
        throw new Error(`API Key Invalid status was not shown: ${JSON.stringify(statuses)}`);
    }
    if (!messages.some((message) => /rejected the saved API key as invalid/i.test(message))) {
        throw new Error(`Helpful invalid-key message was not displayed: ${JSON.stringify(messages)}`);
    }

    context.window.SocketConnectionCore.EventHandlers.handleClose({ code: 1007, reason: 'invalid key' });
    const lastStatus = statuses[statuses.length - 1] || {};
    if (lastStatus.message !== 'API Key Invalid') {
        throw new Error(`Close handler did not preserve invalid-key status: ${JSON.stringify(statuses)}`);
    }

    console.log('GEMINI_INVALID_API_KEY_GATE_SMOKE_OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
