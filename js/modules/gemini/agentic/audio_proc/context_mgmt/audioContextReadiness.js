/**
 * audioContextReadiness.js
 * Enhanced audio context readiness checks and iOS unlocking logic.
 */

console.log("audioContextReadiness.js loading...");

window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

// Enhanced function to ensure audio context is ready (call before playing audio)
async function ensureAudioContextReady() {
    const state = window.AudioContextState;
    const helpers = window.AudioProcessingControlsAgentic;

    // Global audio context was closed after reconnect/stop; force a clean rebuild.
    if (state.audioInputContext && state.audioInputContext.state === 'closed') {
        state.audioInputContext = null;
        state.audioContextInitialized = false;
        window.audioInputContext = null;
    }
    // Check if we've already unlocked audio
    const wasUnlocked = localStorage.getItem('audioContextUnlocked') === 'true' || window.audioContextUnlocked;

    // iOS-specific unlock check
    if (helpers.isIOSDevice && helpers.isIOSDevice() && !state.iOSAudioUnlocked) {
        console.log("iOS device detected - performing iOS-specific audio unlock");
        if (window.iOSAudioUnlock) await window.iOSAudioUnlock.unlockIOSAudio();
    }

    if (!state.audioContextInitialized) {
        // Use the function from initialization module
        if (typeof helpers.initializeAudioContextOnUserGesture === 'function') {
            const success = await helpers.initializeAudioContextOnUserGesture();
            if (!success && !wasUnlocked) {
                console.warn("Audio context not initialized and no user gesture detected");
                // Set up a more aggressive listener for next interaction
                if (window.UserGestureHandlers) window.UserGestureHandlers.setupEmergencyAudioUnlock();
                return false;
            }
        } else {
            console.error("initializeAudioContextOnUserGesture not found!");
            return false;
        }
    }

    // Always try to resume suspended contexts with multiple attempts
    if (state.audioInputContext && state.audioInputContext.state === 'suspended') {
        try {
            console.log("Making multiple resume attempts for audio context");

            // Try multiple resume attempts with delays
            for (let attempt = 1; attempt <= 3; attempt++) {
                await state.audioInputContext.resume();
                console.log(`Audio context resume attempt ${attempt} completed, state: ${state.audioInputContext.state}`);

                if (state.audioInputContext.state === 'running') {
                    break;
                } else if (attempt < 3) {
                    // Wait before next attempt
                    await new Promise(resolve => setTimeout(resolve, 100 * attempt));
                }
            }

            if (state.audioInputContext.state === 'running') {
                window.audioContextUnlocked = true;
                localStorage.setItem('audioContextUnlocked', 'true');
                console.log("Audio context successfully resumed and marked as unlocked");
            } else {
                console.warn("Audio context still not running after multiple resume attempts");
                return false;
            }
        } catch (e) {
            console.warn("Failed to resume audio context:", e);
            return false;
        }
    }

    return state.audioContextInitialized && (!state.audioInputContext || state.audioInputContext.state === 'running');
}

// Export readiness function
window.AudioProcessingControlsAgentic.ensureAudioContextReady = ensureAudioContextReady;

// Initialize the user gesture listeners if handlers are present
if (window.UserGestureHandlers) {
    window.UserGestureHandlers.setupUserGestureListeners();
}

console.log("audioContextReadiness.js loaded.");
