/**
 * userGestureCoordinator.js
 * Coordinator for user gesture handling.
 * Aggregates functionality from Detection, Listeners, Logic, and Emergency modules.
 * Exposes window.UserGestureHandlers for backward compatibility.
 */

window.UserGestureCore = window.UserGestureCore || {};

window.UserGestureHandlers = {
    // Check if we've had user interaction
    hasUserGesture: function () {
        return window.UserGestureCore.GestureDetection.hasUserGesture();
    },

    // Set up user gesture listeners to initialize audio context
    setupUserGestureListeners: function () {
        window.UserGestureCore.Listeners.setupUserGestureListeners();
    },

    // Internal helper to handle successful unlock logic
    _handleSuccessfulUnlock: async function () {
        return window.UserGestureCore.UnlockingLogic.handleSuccessfulUnlock();
    },

    // Emergency audio unlock for cases where normal gesture detection fails
    setupEmergencyAudioUnlock: function () {
        window.UserGestureCore.EmergencyUnlock.setupEmergencyAudioUnlock();
    }
};

console.log("userGestureCoordinator.js loaded - UserGestureHandlers available.");
