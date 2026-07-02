/**
 * serverStatusChecker.js
 * 
 * Handles checking if the server is up and running.
 */

console.log("serverStatusChecker.js loading...");

(function () {
    const State = window.SocketGlobalState;

    function isConnectionDisabledByPreference() {
        try {
            return localStorage.getItem('geminiConnectionEnabled') === 'false';
        } catch (error) {
            return false;
        }
    }

    function isServerDesiredRunning() {
        try {
            return localStorage.getItem('geminiServerDesiredState') === 'running';
        } catch (error) {
            return false;
        }
    }

    function stopReconnectMonitor(message, statusMessage) {
        if (State.continuousReconnectInterval) {
            clearTimeout(State.continuousReconnectInterval);
            State.continuousReconnectInterval = null;
        }

        State.autoReconnectEnabled = false;
        State.serverOfflinePauseActive = true;

        if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus('disconnected', statusMessage || 'Gemini Offline');
        }

        const now = Date.now();
        if (typeof displayMessage === 'function' && now - (State.lastReconnectPauseNoticeAt || 0) > 5000) {
            displayMessage(message, true);
            State.lastReconnectPauseNoticeAt = now;
        }
    }

    function isStatusPayloadRunning(data) {
        if (data?.websocketReady === false) return false;
        return !!data && (
            data.running === true
            || data.status === 'running'
            || data.message === 'running'
        );
    }

    function clearMissingCredentialGateIfVaultReady() {
        if (!State.credentialRequired || State.apiPolicyBlocked || State.apiKeyInvalid) return !State.credentialRequired;
        const controlState = window.GeminiServerControl?.getState?.();
        if (!controlState?.credentialsConfigured) return false;
        State.credentialRequired = false;
        State.geminiApiReady = false;
        State.reconnectAttempts = 0;
        State.serverOfflinePauseActive = false;
        if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus('connecting', 'Gemini credentials ready - reconnecting...');
        }
        return true;
    }

    async function fetchStatusJson(url) {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) return null;
        return response.json();
    }

    function getReadySocketAttempt() {
        if (window.SocketConnectionCore && typeof window.SocketConnectionCore.attemptConnection === 'function') {
            return window.SocketConnectionCore.attemptConnection.bind(window.SocketConnectionCore);
        }
        if (window.SocketConnectionCore && typeof window.SocketConnectionCore.connect === 'function') {
            return window.SocketConnectionCore.connect.bind(window.SocketConnectionCore);
        }
        if (typeof window.attemptConnection === 'function') {
            return window.attemptConnection;
        }
        if (typeof window.connect === 'function') {
            return window.connect;
        }
        return null;
    }

    async function checkServerStatus() {
        try {
            // Extract port from WebSocket URL and calculate status port
            const wsPort = parseInt(State.WS_URL.split(':')[2]) || 9083;
            const statusPort = wsPort + 1; // Status server is always WebSocket port + 1
            // 127.0.0.1 only: the localhost twin probed the SAME machine a second time (via the
            // flaky IPv6-first path) and doubled the console error spam on every offline check.
            const data = await fetchStatusJson(`http://127.0.0.1:${statusPort}/status`);
            return isStatusPayloadRunning(data);
        } catch (error) {
            // Server not responding yet
            return false;
        }
    }

    async function startContinuousReconnectAttempts() {
        if (isServerDesiredRunning()) {
            State.autoReconnectEnabled = true;
            State.serverOfflinePauseActive = false;
        }

        if (!State.autoReconnectEnabled || State.serverOfflinePauseActive) {
            return;
        }

        if (isConnectionDisabledByPreference() && !isServerDesiredRunning()) {
            stopReconnectMonitor(
                "System Message: Gemini connection is disabled by preference. Auto reconnect paused.",
                'Gemini Connection Disabled'
            );
            return;
        } else if (isConnectionDisabledByPreference() && isServerDesiredRunning()) {
            try {
                localStorage.setItem('geminiConnectionEnabled', 'true');
            } catch (error) {
                // Keep the in-memory reconnect path alive even if storage is blocked.
            }
            State.autoReconnectEnabled = true;
            State.serverOfflinePauseActive = false;
        }

        if (State.continuousReconnectInterval) clearTimeout(State.continuousReconnectInterval);

        console.log("Starting continuous reconnection attempts with server status monitoring...");
        if (typeof updateConnectionStatus === 'function') updateConnectionStatus('waiting', 'Monitoring for Server...');
        if (typeof displayMessage === 'function') {
            displayMessage("System Message: Monitoring for server startup...", true);
        }

        let serverStatusCheckCount = 0;
        const maxStatusChecks = State.serverStartupMaxChecks || 10;

        const runCheck = async () => {
            if (!State.autoReconnectEnabled || State.serverOfflinePauseActive) {
                if (State.continuousReconnectInterval) {
                    clearTimeout(State.continuousReconnectInterval);
                    State.continuousReconnectInterval = null;
                }
                return;
            }

            if (State.credentialRequired && !clearMissingCredentialGateIfVaultReady()) {
                if (typeof updateConnectionStatus === 'function') {
                    updateConnectionStatus('error', State.apiPolicyBlocked
                        ? 'API Key Restricted'
                        : (State.apiKeyInvalid ? 'API Key Invalid' : 'API Key Required'));
                }
                if (State.apiPolicyBlocked || State.apiKeyInvalid) {
                    State.autoReconnectEnabled = false;
                    State.serverOfflinePauseActive = true;
                    State.continuousReconnectInterval = null;
                    return;
                }
                State.continuousReconnectInterval = setTimeout(
                    runCheck,
                    Math.max(State.serverOfflinePollInterval || 15000, 10000)
                );
                return;
            }

            // Check if we already have a connection
            if (window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
                clearTimeout(State.continuousReconnectInterval);
                State.continuousReconnectInterval = null;
                console.log("Connection established, stopping continuous attempts");
                return;
            }

            // Check server status periodically
            const serverRunning = await checkServerStatus();
            serverStatusCheckCount++;

            if (serverRunning) {
                console.log("Server detected as running, attempting connection...");
                if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connecting', 'Server Found - Connecting...');
                if (typeof displayMessage === 'function' && serverStatusCheckCount > 1) {
                    displayMessage("System Message: Gemini server detected; reconnecting...", true);
                }
                serverStatusCheckCount = 0;
            } else {
                if (serverStatusCheckCount === 1 || serverStatusCheckCount === maxStatusChecks) {
                    console.log("Gemini server unavailable; background monitoring remains active.");
                }
                // file:// pages usually run without any server on purpose — skip the fast-probe
                // burst (5s x10) and go straight to the slow poll so an intentionally serverless
                // session isn't peppered with connection errors. A server that starts is still
                // picked up within one slow interval.
                const fastProbe = serverStatusCheckCount < maxStatusChecks && window.location.protocol !== 'file:';
                if (typeof updateConnectionStatus === 'function') {
                    updateConnectionStatus('waiting', fastProbe ? 'Waiting for Gemini Server...' : 'Gemini Server Offline - Monitoring');
                }
                const delay = fastProbe
                    ? Math.max(State.connectionBackoffDelay, 5000)
                    : Math.max(State.serverOfflinePollInterval || 15000, 10000);
                State.continuousReconnectInterval = setTimeout(runCheck, delay);
                return;
            }

            // Attempt connection. Require the real SocketConnectionCore method,
            // not only the lazy global wrapper, because the wrapper can exist
            // before the underlying runtime is ready and silently no-op.
            if (!window.webSocket || window.webSocket.readyState >= WebSocket.CLOSING) {
                const attempt = getReadySocketAttempt();
                if (attempt) {
                    console.log("Attempting automatic reconnection...");
                    attempt();
                } else {
                    console.warn("Gemini socket runtime not ready for automatic reconnection.");
                    if (typeof updateConnectionStatus === 'function') {
                        updateConnectionStatus('connecting', 'Socket Runtime Loading...');
                    }
                }
            }
            State.continuousReconnectInterval = setTimeout(
                runCheck,
                Math.max(State.connectionBackoffDelay, 5000)
            );
        };
        State.continuousReconnectInterval = setTimeout(runCheck, 250);
    }

    // Export functions
    window.checkServerStatus = checkServerStatus;
    window.startContinuousReconnectAttempts = startContinuousReconnectAttempts;

})();

console.log("serverStatusChecker.js loaded.");
