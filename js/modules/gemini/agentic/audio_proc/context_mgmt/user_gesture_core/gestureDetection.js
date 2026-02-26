/**
 * gestureDetection.js
 * Handles detection of user gestures and managing the unlocked state.
 */

window.UserGestureCore = window.UserGestureCore || {};

window.UserGestureCore.GestureDetection = {
    // Check if we've had user interaction
    hasUserGesture: function () {
        // Try to create a temporary AudioContext to test if user gesture is available
        try {
            const testContext = new (window.AudioContext || window.webkitAudioContext)();
            const hasGesture = testContext.state !== 'suspended';
            testContext.close();
            return hasGesture;
        } catch (e) {
            return false;
        }
    },

    markAsUnlocked: function () {
        window.audioContextUnlocked = true;
        localStorage.setItem('audioContextUnlocked', 'true');
    },

    isUnlocked: function () {
        return window.audioContextUnlocked === true || localStorage.getItem('audioContextUnlocked') === 'true';
    }
};

console.log("gestureDetection.js loaded.");
