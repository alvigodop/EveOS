/**
 * errorEventHandler.js
 * Handles WebSocket error events.
 */

window.SocketConnectionCore = window.SocketConnectionCore || {};
window.SocketConnectionCore.EventHandlers = window.SocketConnectionCore.EventHandlers || {};

window.SocketConnectionCore.EventHandlers.handleError = function (event) {
    const State = window.SocketGlobalState;
    if (!State.autoReconnectEnabled || State.serverOfflinePauseActive) {
        State.isConnecting = false;
        return;
    }

    console.error("WebSocket error:", event);
    State.isConnecting = false;

    const currentPreviewState = (typeof getPreviewModelState === 'function') ? getPreviewModelState() : { isPreviewModel: false, consecutivePreviewModelFailures: 0 };

    if (currentPreviewState.isPreviewModel) {
        if (typeof updateConnectionStatus === 'function') updateConnectionStatus('error', `Preview Model Connection Error (${currentPreviewState.consecutivePreviewModelFailures} failures)`);
    } else {
        if (typeof updateConnectionStatus === 'function') updateConnectionStatus('error', 'Connection Error');
    }

    // For initial connection attempts, don't show reboot button immediately
    if (!State.isInitialConnection) {
        const rebootButton = document.getElementById('rebootButton');
        if (rebootButton) {
            rebootButton.style.display = 'block';
        }
    }

    if (typeof displayMessage === 'function') {
        if (currentPreviewState.isPreviewModel && currentPreviewState.consecutivePreviewModelFailures > 2) {
            displayMessage("System Message: Preview model connection error - these models can be highly unstable. Applying extended backoff...", true);
        } else {
            displayMessage("System Message: Connection error - retrying...", true);
        }
    }
};

console.log("errorEventHandler.js loaded.");
