/**
 * audioContextHelpers.js
 * Helper functions for audio context management.
 */

console.log("audioContextHelpers.js loading...");

window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

// Check if we're in a secure context
function isSecureContext() {
    return window.isSecureContext || location.protocol === 'https:';
}

// Check if URL.createObjectURL is available
function isCreateObjectURLAvailable() {
    return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
}

// Check if we're on iOS
function isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Helper to safely display messages
function safeDisplayMessage(message, isError = false) {
    if (typeof displayMessage === 'function') {
        displayMessage(message, isError);
    } else if (typeof window.MessagingLog !== 'undefined' && typeof window.MessagingLog.displayMessage === 'function') {
        window.MessagingLog.displayMessage(message, isError);
    } else if (typeof window.MonitorUI !== 'undefined' && typeof window.MonitorUI.displayMessage === 'function') {
        window.MonitorUI.displayMessage(message, isError);
    } else {
        const logFn = isError ? console.error : console.log;
        logFn(message);
    }
}

// Export helpers
window.AudioProcessingControlsAgentic.isSecureContext = isSecureContext;
window.AudioProcessingControlsAgentic.isCreateObjectURLAvailable = isCreateObjectURLAvailable;
window.AudioProcessingControlsAgentic.isIOSDevice = isIOSDevice;
window.AudioProcessingControlsAgentic.safeDisplayMessage = safeDisplayMessage;

console.log("audioContextHelpers.js loaded.");
