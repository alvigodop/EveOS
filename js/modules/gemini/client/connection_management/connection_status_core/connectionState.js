/**
 * connectionState.js
 * Manages the state for connection status and preview model flags.
 * Decouples state management from UI updates.
 */

window.ConnectionStatusCore = window.ConnectionStatusCore || {};

(function () {
    // Internal state
    let currentConnectionStatus = { status: 'disconnected', message: 'Not Connected' };

    // Preview model state (shared with socket connection logic)
    let isPreviewModel = false;
    let consecutivePreviewModelFailures = 0;
    let previewModelBackoffMultiplier = 1;
    const MAX_PREVIEW_MODEL_FAILURES = 5;

    // State getters
    window.ConnectionStatusCore.getCurrentConnectionStatus = function () {
        return currentConnectionStatus;
    };

    window.ConnectionStatusCore.getPreviewModelState = function () {
        return {
            isPreviewModel,
            consecutivePreviewModelFailures,
            previewModelBackoffMultiplier
        };
    };

    // State setters/modifiers
    window.ConnectionStatusCore.updateConnectionStatusState = function (status, message) {
        currentConnectionStatus = { status: status, message: message };

        // Detect if we're dealing with a preview model based on the message
        if (message && (message.includes('preview') || message.includes('experimental') || message.includes('native-audio-dialog'))) {
            isPreviewModel = true;
        }

        // Logic for preview model failure tracking
        if (status === 'connected') {
            // Reset on successful connection
            consecutivePreviewModelFailures = 0;
            previewModelBackoffMultiplier = 1;
        } else if (status === 'error' && isPreviewModel) {
            // Track failures
            consecutivePreviewModelFailures++;
            if (consecutivePreviewModelFailures <= MAX_PREVIEW_MODEL_FAILURES) {
                previewModelBackoffMultiplier = Math.min(previewModelBackoffMultiplier * 1.5, 8); // Cap at 8x multiplier
            }
        }
    };

    window.ConnectionStatusCore.setPreviewModelState = function (state) {
        if (typeof state.isPreviewModel !== 'undefined') isPreviewModel = state.isPreviewModel;
        if (typeof state.consecutivePreviewModelFailures !== 'undefined') consecutivePreviewModelFailures = state.consecutivePreviewModelFailures;
        if (typeof state.previewModelBackoffMultiplier !== 'undefined') previewModelBackoffMultiplier = state.previewModelBackoffMultiplier;
    };

    // Expose constants if needed
    window.ConnectionStatusCore.MAX_PREVIEW_MODEL_FAILURES = MAX_PREVIEW_MODEL_FAILURES;

    // Global backward compatibility for socketClient
    // These were previously exposed by connectionStatusHandler.js
    window.getPreviewModelState = window.ConnectionStatusCore.getPreviewModelState;
    window.setPreviewModelState = window.ConnectionStatusCore.setPreviewModelState;
    window.MAX_PREVIEW_MODEL_FAILURES = MAX_PREVIEW_MODEL_FAILURES;
    window.getCurrentConnectionStatus = window.ConnectionStatusCore.getCurrentConnectionStatus;

    console.log("connectionState.js loaded.");
})();
