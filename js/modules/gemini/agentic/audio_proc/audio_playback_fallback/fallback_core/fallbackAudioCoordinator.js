/**
 * fallbackAudioCoordinator.js
 * Main entrance for audio fallback logic. Coordinates between Web Audio and HTML5/WAV fallbacks.
 */

// Ensure namespace exists
window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};
window.FallbackAudioCore = window.FallbackAudioCore || {};

function playAudioWithFallbackMethod(arrayBuffer, container = null) {
    try {
        // Try Web Audio first
        return window.FallbackAudioCore.playAudioWithWebAudio(arrayBuffer, container);
    } catch (error) {
        console.error("Error in fallback audio playback (Web Audio attempt):", error);

        // Try basic HTML5 Audio element as last resort
        try {
            console.log("Attempting HTML5 Audio element fallback...");
            return window.FallbackAudioCore.playAudioWithHTML5Fallback(arrayBuffer, container);
        } catch (html5Error) {
            console.error("HTML5 Audio fallback also failed:", html5Error);
            throw error;
        }
    }
}

// Global Exports
window.playAudioWithFallbackMethod = playAudioWithFallbackMethod;
window.playAudioWithHTML5Fallback = window.FallbackAudioCore.playAudioWithHTML5Fallback;

// Add to AudioProcessingControlsAgentic namespace for consistent access
window.AudioProcessingControlsAgentic.playAudioWithFallbackMethod = playAudioWithFallbackMethod;
window.AudioProcessingControlsAgentic.playAudioWithHTML5Fallback = window.FallbackAudioCore.playAudioWithHTML5Fallback;

console.log("fallbackAudioCoordinator.js loaded.");
