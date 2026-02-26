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

    function pauseReconnect(message, statusMessage) {
        if (State.continuousReconnectInterval) {
            clearInterval(State.continuousReconnectInterval);
            State.continuousReconnectInterval = null;
        }

        State.autoReconnectEnabled = false;
        State.serverOfflinePauseActive = true;
        State.reconnectAttempts = State.MAX_RECONNECT_ATTEMPTS;
        try {
            localStorage.setItem('geminiConnectionEnabled', 'false');
        } catch (error) {
            // Ignore storage write errors in restricted environments.
        }

        if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus('disconnected', statusMessage || 'Gemini Offline');
        }

        const now = Date.now();
        if (typeof displayMessage === 'function' && now - (State.lastReconnectPauseNoticeAt || 0) > 5000) {
            displayMessage(message, true);
            State.lastReconnectPauseNoticeAt = now;
        }
    }

    async function checkServerStatus() {
        try {
            // Extract port from WebSocket URL and calculate status port
            const wsPort = parseInt(State.WS_URL.split(':')[2]) || 9083;
            const statusPort = wsPort + 1; // Status server is always WebSocket port + 1
            const statusUrl = `http://localhost:${statusPort}/status`;

            const response = await fetch(statusUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });

            if (response.ok) {
                const data = await response.json();
                return data.status === 'running';
            }
            return false;
        } catch (error) {
            // Server not responding yet
            return false;
        }
    }

    async function startContinuousReconnectAttempts() {
        if (!State.autoReconnectEnabled || State.serverOfflinePauseActive) {
            return;
        }

        if (isConnectionDisabledByPreference()) {
            pauseReconnect(
                "System Message: Gemini connection is disabled by preference. Auto reconnect paused.",
                'Gemini Connection Disabled'
            );
            return;
        }

        if (State.continuousReconnectInterval) {
            clearInterval(State.continuousReconnectInterval);
        }

        console.log("Starting continuous reconnection attempts with server status monitoring...");
        if (typeof updateConnectionStatus === 'function') updateConnectionStatus('waiting', 'Monitoring for Server...');
        if (typeof displayMessage === 'function') {
            displayMessage("System Message: Monitoring for server startup...", true);
        }

        let serverStatusCheckCount = 0;
        const maxStatusChecks = State.serverStartupMaxChecks || 10;

        State.continuousReconnectInterval = setInterval(async () => {
            if (!State.autoReconnectEnabled || State.serverOfflinePauseActive) {
                if (State.continuousReconnectInterval) {
                    clearInterval(State.continuousReconnectInterval);
                    State.continuousReconnectInterval = null;
                }
                return;
            }

            // Check if we already have a connection
            if (window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
                clearInterval(State.continuousReconnectInterval);
                State.continuousReconnectInterval = null;
                console.log("Connection established, stopping continuous attempts");
                return;
            }

            // Check server status periodically
            if (serverStatusCheckCount < maxStatusChecks) {
                const serverRunning = await checkServerStatus();
                serverStatusCheckCount++;

                if (serverRunning) {
                    console.log("Server detected as running, attempting connection...");
                    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connecting', 'Server Found - Connecting...');
                    if (typeof displayMessage === 'function') {
                        displayMessage("System Message: Server detected, connecting...", true);
                    }
                    serverStatusCheckCount = 0; // Reset counter
                } else {
                    if (serverStatusCheckCount === 1 || serverStatusCheckCount % 3 === 0) {
                        console.log("Server not yet available, continuing to monitor...");
                    }
                    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('waiting', `Waiting for Server... (${serverStatusCheckCount}/${maxStatusChecks})`);

                    if (serverStatusCheckCount >= maxStatusChecks) {
                        pauseReconnect(
                            "System Message: Gemini server appears offline. Auto reconnect paused (manual reconnect when server is available).",
                            'Gemini Server Offline'
                        );
                    }
                    return; // Don't attempt connection if server isn't running
                }
            }

            // Attempt connection
            if (!window.webSocket || window.webSocket.readyState === WebSocket.CLOSED) {
                console.log("Attempting automatic reconnection...");
                if (typeof window.attemptConnection === 'function') {
                    window.attemptConnection();
                }
            }
        }, Math.max(State.connectionBackoffDelay, 5000)); // At least 5 seconds between attempts
    }

    // Export functions
    window.checkServerStatus = checkServerStatus;
    window.startContinuousReconnectAttempts = startContinuousReconnectAttempts;

})();

console.log("serverStatusChecker.js loaded.");
