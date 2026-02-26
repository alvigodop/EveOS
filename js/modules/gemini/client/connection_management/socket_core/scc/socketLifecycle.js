/**
 * socketLifecycle.js
 * Manages connection lifecycle (attempt, connect, auto-reconnect).
 */

window.SocketConnectionCore = window.SocketConnectionCore || {};

window.SocketConnectionCore.attemptConnection = function () {
    const State = window.SocketGlobalState;
    if (State.isConnecting) {
        return;
    }

    const now = Date.now();

    // Get preview model state
    const { isPreviewModel, consecutivePreviewModelFailures, previewModelBackoffMultiplier } =
        (typeof getPreviewModelState === 'function') ? getPreviewModelState() : { isPreviewModel: false, consecutivePreviewModelFailures: 0, previewModelBackoffMultiplier: 1 };

    // Apply preview model-specific backoff
    if (isPreviewModel && consecutivePreviewModelFailures > 0) {
        const previewModelDelay = 1000 * previewModelBackoffMultiplier;
        if (now - State.lastConnectionAttempt < previewModelDelay) {
            console.log(`Preview model backoff active - waiting ${Math.round((previewModelDelay - (now - State.lastConnectionAttempt)) / 1000)}s before retry`);
            return;
        }

        // Apply cooldown for excessive failures
        if (consecutivePreviewModelFailures >= State.MAX_PREVIEW_MODEL_FAILURES) {
            if (now - State.lastConnectionAttempt < State.PREVIEW_MODEL_COOLDOWN_TIME) {
                const remainingCooldown = Math.round((State.PREVIEW_MODEL_COOLDOWN_TIME - (now - State.lastConnectionAttempt)) / 1000);
                if (typeof updateConnectionStatus === 'function') updateConnectionStatus('waiting', `Preview model cooldown: ${remainingCooldown}s remaining`);
                console.log(`Preview model cooldown active - ${remainingCooldown}s remaining`);
                return;
            } else {
                // Reset after cooldown period
                if (typeof setPreviewModelState === 'function') setPreviewModelState({ consecutivePreviewModelFailures: 0, previewModelBackoffMultiplier: 1 });
                console.log('Preview model cooldown period ended - resetting failure counters');
            }
        }
    } else if (now - State.lastConnectionAttempt < 1000) { // Minimum 1 second between attempts for non-preview models
        return;
    }

    State.lastConnectionAttempt = now;
    State.isConnecting = true;

    console.log(`Attempting connection (attempt ${State.reconnectAttempts + 1})`);
    if (isPreviewModel && consecutivePreviewModelFailures > 0) {
        if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connecting', `Connecting to preview model... (${State.reconnectAttempts + 1}, ${consecutivePreviewModelFailures} recent failures)`);
    } else {
        if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connecting', `Connecting... (${State.reconnectAttempts + 1})`);
    }

    try {
        window.webSocket = new WebSocket(State.WS_URL);

        // Assign handlers from SocketConnectionCore.EventHandlers
        if (window.SocketConnectionCore.EventHandlers) {
            window.webSocket.onopen = window.SocketConnectionCore.EventHandlers.handleOpen;
            window.webSocket.onclose = window.SocketConnectionCore.EventHandlers.handleClose;
            window.webSocket.onerror = window.SocketConnectionCore.EventHandlers.handleError;
        } else {
            console.error("SocketConnectionCore.EventHandlers not loaded, connection will likely fail or misbehave.");
        }

        // Assign global message handler
        window.webSocket.onmessage = window.handleSocketMessage;

    } catch (error) {
        console.error("Error creating WebSocket:", error);
        State.isConnecting = false;
        if (typeof displayMessage === 'function') {
            displayMessage("System Message: Failed to establish connection - retrying...", true);
        }
    }
};

window.SocketConnectionCore.connect = function () {
    const State = window.SocketGlobalState;
    console.log("[Debug] connect() called. isConnecting:", State.isConnecting, "reconnectAttempts:", State.reconnectAttempts);

    // Always reset connection state when explicitly called
    if (window.SocketConnectionCore.resetConnection) {
        window.SocketConnectionCore.resetConnection();
    } else {
        console.warn("resetConnection not available, manual reset might be incomplete");
    }

    State.autoReconnectEnabled = true;
    State.isInitialConnection = true;

    // Start immediate connection attempt
    window.SocketConnectionCore.attemptConnection();

    // Also start continuous attempts for server startup detection
    if (State.serverStartupDetection) {
        setTimeout(() => {
            if (!window.webSocket || window.webSocket.readyState !== WebSocket.OPEN) {
                if (typeof startContinuousReconnectAttempts === 'function') window.startContinuousReconnectAttempts();
            }
        }, 5000); // Start continuous attempts after 5 seconds if not connected
    }
};

window.SocketConnectionCore.stopAutoReconnect = function () {
    const State = window.SocketGlobalState;
    State.autoReconnectEnabled = false;
    if (State.reconnectTimeout) {
        clearTimeout(State.reconnectTimeout);
        State.reconnectTimeout = null;
    }
    if (State.continuousReconnectInterval) {
        clearInterval(State.continuousReconnectInterval);
        State.continuousReconnectInterval = null;
    }
};

window.SocketConnectionCore.startAutoReconnect = function () {
    const State = window.SocketGlobalState;
    State.autoReconnectEnabled = true;
    if (!window.webSocket || window.webSocket.readyState === WebSocket.CLOSED) {
        window.SocketConnectionCore.connect();
    }
};

console.log("socketLifecycle.js loaded.");
