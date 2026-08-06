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

function isGeminiServerDesiredRunning() {
    try {
        return localStorage.getItem('geminiServerDesiredState') === 'running';
    } catch (error) {
        return false;
    }
}

function isGeminiManualStopActive() {
    try {
        return localStorage.getItem('geminiServerManualStopAt') != null
            && localStorage.getItem('geminiServerDesiredState') === 'stopped';
    } catch (error) {
        return false;
    }
}

function setGeminiConnectionPreference(enabled) {
    try {
        localStorage.setItem('geminiConnectionEnabled', enabled ? 'true' : 'false');
    } catch (error) {
        // Restricted storage should not block the in-memory connection path.
    }
    if (!window.SocketGlobalState) return;
    window.SocketGlobalState.autoReconnectEnabled = !!enabled;
    window.SocketGlobalState.serverOfflinePauseActive = !enabled;
    if (enabled) {
        window.SocketGlobalState.reconnectAttempts = 0;
        window.SocketGlobalState.lastReconnectPauseNoticeAt = 0;
    }
}

function getGeminiStatusUrl() {
    const wsUrl = (window.SocketGlobalState && window.SocketGlobalState.WS_URL) || 'ws://localhost:9085';
    const wsPort = parseInt(wsUrl.split(':')[2], 10) || 9085;
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

function getReadySocketConnect() {
    if (window.SocketConnectionCore && typeof window.SocketConnectionCore.connect === 'function') {
        return window.SocketConnectionCore.connect.bind(window.SocketConnectionCore);
    }
    return null;
}

function waitForSocketConnect(timeoutMs = 15000) {
    const ready = getReadySocketConnect();
    if (ready) return Promise.resolve(ready);

    return new Promise((resolve) => {
        const startedAt = Date.now();
        let timer = null;

        const cleanup = () => {
            if (timer) clearTimeout(timer);
            window.removeEventListener('eve:gemini-socket-ready', check);
        };

        const check = () => {
            const connect = getReadySocketConnect();
            if (connect) {
                cleanup();
                resolve(connect);
                return;
            }

            if (Date.now() - startedAt >= timeoutMs) {
                cleanup();
                resolve(null);
                return;
            }

            timer = setTimeout(check, 100);
        };

        window.addEventListener('eve:gemini-socket-ready', check, { once: true });
        timer = setTimeout(check, 100);
    });
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
            const shouldReviveClient = !isGeminiManualStopActive()
                && (isGeminiServerDesiredRunning() || await isGeminiServerReachable());

            if (shouldReviveClient) {
                setGeminiConnectionPreference(true);
                if (typeof updateConnectionStatus === 'function') {
                    updateConnectionStatus('connecting', 'Gemini server online - reconnecting...');
                }
            } else {
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

        // Wait for the real socket core method, not just the lazy global wrapper.
        // The wrapper can exist before SocketConnectionCore.connect is installed;
        // calling it once at that point no-ops and leaves the UI stuck at
        // "Server Found - Connecting...".
        waitForSocketConnect().then((connectFn) => {
            if (connectFn) {
                if (typeof window.displayMessage === 'function') {
                    window.displayMessage("System Message: Attempting to connect to server automatically...", true);
                }
                connectFn();
                return;
            }

            console.error("Failed to find SocketConnectionCore.connect. Connection scripts might not have loaded.");
            if (typeof updateConnectionStatus === 'function') {
                updateConnectionStatus('error', 'Socket Runtime Unavailable');
            }
            if (typeof window.displayMessage === 'function') {
                window.displayMessage("System Error: Gemini socket runtime failed to load.", true);
            }
        });

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
