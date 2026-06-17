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
            const hosts = ['127.0.0.1', 'localhost'];
            for (const host of hosts) {
                const data = await fetchStatusJson(`http://${host}:${statusPort}/status`);
                if (isStatusPayloadRunning(data)) return true;
            }
            return false;
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

            if (State.credentialRequired) {
                if (typeof updateConnectionStatus === 'function') {
                    updateConnectionStatus('error', 'API Key Required');
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
                const fastProbe = serverStatusCheckCount < maxStatusChecks;
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
