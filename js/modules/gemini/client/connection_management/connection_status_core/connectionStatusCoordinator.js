/**
 * connectionStatusCoordinator.js
 * Coordinator for connection status.
 * Syncs state and UI updates.
 */

window.ConnectionStatusCore = window.ConnectionStatusCore || {};

(function () {
    function updateConnectionStatus(status, message) {
        // 1. Update State
        if (window.ConnectionStatusCore.updateConnectionStatusState) {
            window.ConnectionStatusCore.updateConnectionStatusState(status, message);
        }

        // 2. Attempt to Update UI
        if (window.ConnectionStatusCore.updateConnectionUI) {
            const success = window.ConnectionStatusCore.updateConnectionUI(status, message);

            if (!success) {
                // UI not ready. This is normal during initialization.
                // We do NOT retry loop here.
                // The polling loader or page initializer will eventually call markConnectionElementsAvailable.
            }
        }
    }

    function markConnectionElementsAvailable() {
        // Check if elements are truly available just in case
        if (document.getElementById('connectionDot')) {
            // Get current state
            const currentState = window.ConnectionStatusCore.getCurrentConnectionStatus ?
                window.ConnectionStatusCore.getCurrentConnectionStatus() :
                { status: 'disconnected', message: 'Not Connected' };

            // Force UI update
            if (window.ConnectionStatusCore.updateConnectionUI) {
                window.ConnectionStatusCore.updateConnectionUI(currentState.status, currentState.message);
            }
        }
    }

    // Expose global functions for backward compatibility
    window.updateConnectionStatus = updateConnectionStatus;
    window.markConnectionElementsAvailable = markConnectionElementsAvailable;

    console.log("connectionStatusCoordinator.js loaded - Core functions exposed.");
})();
