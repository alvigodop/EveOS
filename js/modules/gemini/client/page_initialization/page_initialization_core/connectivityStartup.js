/**
 * connectivityStartup.js
 * Handles post-load connectivity initialization and state restoration.
 */

window.PageInitializationCore = window.PageInitializationCore || {};

function isGeminiConnectionEnabledByPreference() {
    try {
        // Treat null (never set) as enabled — only explicit 'false' disables
        return localStorage.getItem('geminiConnectionEnabled') !== 'false';
    } catch (error) {
        return true;
    }
}

function getGeminiStatusUrl() {
    const wsUrl = (window.SocketGlobalState && window.SocketGlobalState.WS_URL) || 'ws://localhost:9083';
    const wsPort = parseInt(wsUrl.split(':')[2], 10) || 9083;
    return `http://127.0.0.1:${wsPort + 1}/status`;
}

function isGeminiStatusPayloadRunning(data) {
    if (data?.websocketReady === false) return false;
    return !!data && (
        data.running === true
        || data.status === 'running'
        || data.message === 'running'
    );
}

async function isGeminiServerReachable() {
    try {
        const response = await fetch(getGeminiStatusUrl(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(1500)
        });

        if (!response.ok) {
            return false;
        }

        const data = await response.json();
        return isGeminiStatusPayloadRunning(data);
    } catch (error) {
        return false;
    }
}

function setGeminiWaitingState(statusMessage, systemMessage) {
    if (window.SocketGlobalState) {
        window.SocketGlobalState.autoReconnectEnabled = true;
        window.SocketGlobalState.serverOfflinePauseActive = false;
    }

    if (typeof updateConnectionStatus === 'function') {
        updateConnectionStatus('disconnected', statusMessage);
    }
    if (systemMessage && typeof window.displayMessage === 'function') {
        window.displayMessage(systemMessage, true);
    }
}

function restoreClientState() {
    console.log('HTML components loaded. Attempting to restore chat from localStorage...');
    let chatRestored = false;
    if (typeof window.restoreChatFromLocalStorage === 'function') {
        chatRestored = window.restoreChatFromLocalStorage();
    }
    if (chatRestored && typeof window.displayMessage === 'function') {
        window.displayMessage("System Message: Chat history restored from browser storage", true);
    }

    if (typeof window.updatePastChatsDisplay === 'function') {
        window.updatePastChatsDisplay();
    }
}

window.PageInitializationCore.ConnectivityStartup = {
    init: async function () {
        console.log('HTML components loaded. Starting WebSocket connection...');

        if (!isGeminiConnectionEnabledByPreference()) {
            if (window.SocketGlobalState) {
                window.SocketGlobalState.autoReconnectEnabled = false;
                window.SocketGlobalState.serverOfflinePauseActive = true;
            }
            if (typeof updateConnectionStatus === 'function') {
                updateConnectionStatus('disconnected', 'Gemini Connection Disabled');
            }
            restoreClientState();
            return;
        }

        const serverReachable = await isGeminiServerReachable();
        if (!serverReachable) {
            setGeminiWaitingState(
                'Gemini Server Offline',
                'System Message: Gemini server offline; EveOS will reconnect when it becomes available.'
            );
            if (typeof window.startContinuousReconnectAttempts === 'function') {
                window.startContinuousReconnectAttempts();
            }
            restoreClientState();
            return;
        }

        // Connection Logic with Polling
        const maxAttempts = 150;
        let attempts = 0;

        const attemptConnect = () => {
            const connectFn =
                (typeof window.connect === 'function' && window.connect) ||
                (window.SocketConnectionCore && typeof window.SocketConnectionCore.connect === 'function'
                    ? window.SocketConnectionCore.connect.bind(window.SocketConnectionCore)
                    : null);

            if (connectFn) {
                if (typeof window.displayMessage === 'function') {
                    window.displayMessage("System Message: Attempting to connect to server automatically...", true);
                }
                connectFn();
            } else {
                attempts++;
                if (attempts < maxAttempts) {
                    // console.log(`Waiting for window.connect... (${attempts}/${maxAttempts})`);
                    setTimeout(attemptConnect, 100);
                } else {
                    console.error("Failed to find window.connect after maximum attempts. Connection scripts might not have loaded.");
                    if (typeof window.displayMessage === 'function') {
                        window.displayMessage("System Error: Connection scripts failed to load.", true);
                    }
                }
            }
        };

        setTimeout(attemptConnect, 200);

        restoreClientState();
    },

    preInitReset: function () {
        const coreReset =
            window.SocketConnectionCore && typeof window.SocketConnectionCore.resetConnection === 'function'
                ? window.SocketConnectionCore.resetConnection.bind(window.SocketConnectionCore)
                : null;

        if (coreReset) {
            coreReset();
        }
    },

    showInitialMessage: function () {
        // Intentionally no-op to avoid noisy startup logs before connectivity decision.
    }
};

console.log("connectivityStartup.js loaded.");
