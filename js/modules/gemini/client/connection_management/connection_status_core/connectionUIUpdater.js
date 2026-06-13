/**
 * connectionUIUpdater.js
 * Handles DOM updates for connection status.
 * Pure UI logic - does not manage state.
 */

window.ConnectionStatusCore = window.ConnectionStatusCore || {};

(function () {
    let connectionElementsAvailable = false;

    window.ConnectionStatusCore.updateConnectionUI = function (status, message) {
        const connectionDot = document.getElementById('connectionDot');
        const connectionText = document.getElementById('connectionText');
        const connectionRoot = document.getElementById('connectionStatus');

        if (!connectionDot || !connectionText) {
            // UI not ready yet
            connectionElementsAvailable = false;
            return false; // Indicating failure to update UI
        }

        connectionElementsAvailable = true;
        if (connectionRoot) connectionRoot.dataset.status = status || 'unknown';

        switch (status) {
            case 'connecting':
                connectionDot.style.backgroundColor = '#ff9800'; // Orange
                connectionText.textContent = message || 'Connecting...';
                break;
            case 'connected':
                connectionDot.style.backgroundColor = '#4caf50'; // Green
                connectionText.textContent = message || 'Connected';
                break;
            case 'disconnected':
                connectionDot.style.backgroundColor = '#f44336'; // Red
                connectionText.textContent = message || 'Disconnected';
                break;
            case 'error':
                connectionDot.style.backgroundColor = '#f44336'; // Red
                connectionText.textContent = message || 'Connection Error';
                break;
            case 'waiting':
                connectionDot.style.backgroundColor = '#ff9800'; // Orange
                connectionText.textContent = message || 'Waiting for Server...';
                break;
            default:
                connectionDot.style.backgroundColor = '#9e9e9e'; // Gray
                connectionText.textContent = message || 'Unknown';
        }

        return true; // Indicating success
    };

    window.ConnectionStatusCore.areConnectionElementsAvailable = function () {
        return connectionElementsAvailable;
    };

    console.log("connectionUIUpdater.js loaded.");
})();
