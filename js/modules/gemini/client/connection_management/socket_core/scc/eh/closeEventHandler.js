/**
 * closeEventHandler.js
 * Handles WebSocket close events.
 */

window.SocketConnectionCore = window.SocketConnectionCore || {};
window.SocketConnectionCore.EventHandlers = window.SocketConnectionCore.EventHandlers || {};

function geminiConnectionDisabledByUser() {
    try {
        const connectionDisabled = localStorage.getItem('geminiConnectionEnabled') === 'false';
        const desiredRunning = localStorage.getItem('geminiServerDesiredState') === 'running';
        const manuallyStopped = localStorage.getItem('geminiServerManualStopAt') != null
            && localStorage.getItem('geminiServerDesiredState') === 'stopped';
        return manuallyStopped || (connectionDisabled && !desiredRunning);
    } catch (_) {
        return window.SocketGlobalState?.autoReconnectEnabled === false;
    }
}

function isInteractiveOwnershipTransfer(event) {
    return Number(event?.code) === 4001
        && /replaced by a newer interactive eveos connection/i.test(String(event?.reason || ''));
}

function pauseForInteractiveOwnershipTransfer(event) {
    const State = window.SocketGlobalState;
    State.sessionOwnershipTransferred = true;
    State.sessionOwnershipTransferReason = String(event?.reason || 'Interactive session moved');
    State.serverOfflinePauseActive = true;
    State.reconnectAttempts = 0;

    if (State.reconnectTimeout) {
        clearTimeout(State.reconnectTimeout);
        State.reconnectTimeout = null;
    }
    if (State.continuousReconnectInterval) {
        clearTimeout(State.continuousReconnectInterval);
        State.continuousReconnectInterval = null;
    }

    if (typeof updateConnectionStatus === 'function') {
        updateConnectionStatus('disconnected', 'Active in Another EveOS Window');
    }
    if (typeof displayMessage === 'function') {
        displayMessage(
            'System Message: Gemini moved to a newer EveOS window. Auto reconnect is paused here; click the connection status to reclaim it.',
            true
        );
    }
    window.dispatchEvent?.(new CustomEvent('eve:gemini-session-transferred', {
        detail: { reason: State.sessionOwnershipTransferReason }
    }));
}

window.SocketConnectionCore.EventHandlers.handleClose = function (event) {
    const State = window.SocketGlobalState;
    const plannedRotation = State.plannedSessionRotation === true;
    const cleanFallback = State.resumptionFallbackPending === true;
    console.log("WebSocket closed:", event);
    State.isConnecting = false;
    State.geminiApiReady = false;
    State.shouldReplayContextAfterReconnect = cleanFallback || !plannedRotation;

    // Clean up native WebSocket monitoring FIRST
    if (window.webSocket && window.webSocket._connectionHealthInterval) {
        try {
            clearInterval(window.webSocket._connectionHealthInterval);
            window.webSocket._connectionHealthInterval = null;
        } catch (e) {
            console.warn("Error cleaning up connection health interval:", e);
        }
    }

    // Stop application-level ping/pong
    if (typeof stopApplicationLevelPingPong === 'function') stopApplicationLevelPingPong();

    window.webSocket = null;

    if (isInteractiveOwnershipTransfer(event)) {
        pauseForInteractiveOwnershipTransfer(event);
        return;
    }

    if (geminiConnectionDisabledByUser()) {
        State.autoReconnectEnabled = false;
        State.serverOfflinePauseActive = true;
        if (State.reconnectTimeout) {
            clearTimeout(State.reconnectTimeout);
            State.reconnectTimeout = null;
        }
        if (State.continuousReconnectInterval) {
            clearInterval(State.continuousReconnectInterval);
            State.continuousReconnectInterval = null;
        }
        if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus('disconnected', 'Gemini Connection Disabled');
        }
        return;
    }

    if (State.credentialRequired) {
        if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus('error', State.credentialStatusMessage
                || (State.apiPolicyBlocked
                    ? 'API Key Restricted'
                    : (State.apiKeyInvalid ? 'API Key Invalid' : 'API Key Required')));
        }
        return;
    }

    if (plannedRotation && State.autoReconnectEnabled) {
        State.plannedSessionRotation = false;
        State.resumptionFallbackPending = false;
        State.reconnectAttempts = 0;
        State.lastConnectionAttempt = 0;
        if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus('connecting', cleanFallback
                ? 'Starting Fresh Gemini Session...'
                : 'Resuming Gemini Session...');
        }
        if (State.reconnectTimeout) clearTimeout(State.reconnectTimeout);
        State.reconnectTimeout = setTimeout(() => {
            State.reconnectTimeout = null;
            window.attemptConnection?.();
        }, 150);
        return;
    }

    if (typeof updateConnectionStatus === 'function') {
        updateConnectionStatus(
            State.autoReconnectEnabled ? 'waiting' : 'disconnected',
            State.autoReconnectEnabled ? 'Connection Interrupted - Reconnecting...' : 'Connection Lost'
        );
    }

    if (State.autoReconnectEnabled && State.reconnectAttempts < State.MAX_RECONNECT_ATTEMPTS) {
        if (typeof displayMessage === 'function') {
            displayMessage(`System Message: Connection lost - reconnecting... (attempt ${State.reconnectAttempts + 1}/${State.MAX_RECONNECT_ATTEMPTS})`, true);
        }

        State.reconnectAttempts++;

        // Get fresh state
        const currentPreviewState = (typeof getPreviewModelState === 'function') ? getPreviewModelState() : { isPreviewModel: false, consecutivePreviewModelFailures: 0, previewModelBackoffMultiplier: 1 };

        let baseDelay = State.INITIAL_CONNECTION_ATTEMPT_INTERVAL * Math.pow(2, State.reconnectAttempts - 1);

        if (currentPreviewState.isPreviewModel && currentPreviewState.consecutivePreviewModelFailures > 0) {
            baseDelay *= currentPreviewState.previewModelBackoffMultiplier;
            console.log(`Applying preview model backoff multiplier: ${currentPreviewState.previewModelBackoffMultiplier}x`);
        }

        State.connectionBackoffDelay = Math.min(baseDelay, State.MAX_BACKOFF_INTERVAL);

        const displayDelay = Math.round(State.connectionBackoffDelay / 1000);
        if (currentPreviewState.isPreviewModel) {
            if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connecting', `Preview model reconnecting in ${displayDelay}s...`);
        } else {
            if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connecting', `Reconnecting in ${displayDelay}s...`);
        }

        if (State.reconnectTimeout) {
            clearTimeout(State.reconnectTimeout);
        }

        State.reconnectTimeout = setTimeout(() => {
            if (typeof window.attemptConnection === 'function') {
                window.attemptConnection();
            } else {
                console.warn("window.attemptConnection not available for reconnect");
            }
        }, State.connectionBackoffDelay);

    } else if (State.autoReconnectEnabled && State.reconnectAttempts >= State.MAX_RECONNECT_ATTEMPTS) {
        // Get fresh state
        const currentPreviewState = (typeof getPreviewModelState === 'function') ? getPreviewModelState() : { isPreviewModel: false };

        if (typeof displayMessage === 'function') {
            if (currentPreviewState.isPreviewModel) {
                displayMessage("System Message: Preview model connection attempts exhausted. Starting continuous reconnection with extended delays...", true);
            } else {
                displayMessage("System Message: Maximum reconnection attempts reached. Starting continuous reconnection...", true);
            }
        }
        if (typeof updateConnectionStatus === 'function') updateConnectionStatus('waiting', 'Waiting for Server...');
        // Start continuous attempts for server startup scenarios
        if (typeof startContinuousReconnectAttempts === 'function') window.startContinuousReconnectAttempts();
    }
};

console.log("closeEventHandler.js loaded.");
