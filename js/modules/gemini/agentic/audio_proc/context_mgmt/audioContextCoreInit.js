/**
 * audioContextCoreInit.js
 * Core audio context initialization and management.
 * Orchestrates AudioWorkletInitializer and LegacyAudioInitializer.
 */

console.log("audioContextCoreInit.js loading...");

window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

// Initialize audio context (to be called after user gesture)
async function initializeAudioContext(userInitiated = false) {
    const state = window.AudioContextState;
    const helpers = window.AudioProcessingControlsAgentic;
    const workletHelper = window.AudioContextInitializer && window.AudioContextInitializer.AudioWorkletHelper;
    const legacyHelper = window.AudioContextInitializer && window.AudioContextInitializer.LegacyHelper;

    // Safety check for new modules
    if (!workletHelper || !legacyHelper) {
        console.error("Critical: Audio Initialization modules not loaded.");
        return false;
    }

    // If already initialized, just return success
    if (state.audioContextInitialized && state.audioInputContext && state.audioInputContext.state !== 'closed') {
        return true;
    }

    // If not user initiated and we haven't had user interaction yet, defer initialization
    if (!userInitiated && window.UserGestureHandlers && !window.UserGestureHandlers.hasUserGesture()) {
        console.log("Audio context initialization deferred until user gesture");
        if (helpers.safeDisplayMessage) {
            helpers.safeDisplayMessage("System Message: Audio will be initialized on first user interaction", true);
        }
        return true;
    }

    // Prevent multiple simultaneous initialization attempts
    if (state.pendingAudioContextInit) {
        console.log("Audio context initialization already in progress");
        return false;
    }

    state.pendingAudioContextInit = true;

    try {
        if (state.audioInputContext) {
            try {
                await state.audioInputContext.close();
            } catch (e) {
                console.error("Error closing existing audio context:", e);
            }
        }

        // Create a new audio context
        state.audioInputContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 24000
        });

        // ALSO set the global legacy variable for backward compatibility
        window.audioInputContext = state.audioInputContext;

        console.log("Created new audio context with sample rate:", state.audioInputContext.sampleRate);

        // Try Modern AudioWorklet Initialization
        let initialized = false;

        if (workletHelper.isSupported(state, helpers)) {
            try {
                await workletHelper.initialize(state, helpers);
                initialized = true;

                if (helpers.safeDisplayMessage) {
                    helpers.safeDisplayMessage("System Message: Audio subsystem initialized with AudioWorklet", true);
                }

            } catch (e) {
                console.warn("Modern audio initialization failed, falling back to legacy:", e);
                // Fall through to legacy
            }
        } else {
            // Log why we can't use AudioWorklet
            const reasons = [];
            if (!state.audioInputContext.audioWorklet) reasons.push("AudioWorklet not supported");
            if (helpers.isSecureContext && !helpers.isSecureContext()) reasons.push("Insecure context (requires HTTPS)");
            if (helpers.isCreateObjectURLAvailable && !helpers.isCreateObjectURLAvailable()) reasons.push("URL.createObjectURL not available");
            console.debug("AudioWorklet requirements not met:", reasons.join(", "), "- falling back to legacy mode");
        }

        // Try Legacy Fallback if not initialized
        if (!initialized) {
            const success = await legacyHelper.initialize(state, (msg, isSys) => {
                if (typeof displayMessage === 'function') displayMessage(msg, isSys);
            });

            if (success) {
                initialized = true;
                if (typeof displayMessage === 'function') {
                    displayMessage("System Message: Audio initialized with fallback method (basic Web Audio API)", true);
                }
            } else {
                throw new Error("All audio initialization methods failed.");
            }
        }

        // Resume the audio context if needed
        if (state.audioInputContext.state === 'suspended') {
            await state.audioInputContext.resume();
            console.log("Audio context resumed");
        }

        state.audioContextInitialized = true;
        return true;

    } catch (error) {
        console.error("Audio initialization failed:", error);
        if (typeof displayMessage === 'function') {
            displayMessage("System Message: Audio initialization failed. Audio features will be disabled until user interaction.", true);
        }
        return false;
    } finally {
        state.pendingAudioContextInit = false;
    }
}

// Initialize audio context on user gesture (to be called by UI elements)
async function initializeAudioContextOnUserGesture() {
    if (window.AudioContextState.audioContextInitialized) {
        return true;
    }

    console.log("Initializing audio context after user gesture");
    return await initializeAudioContext(true);
}

// Export initialization functions
window.AudioProcessingControlsAgentic.initializeAudioContext = initializeAudioContext;
window.AudioProcessingControlsAgentic.initializeAudioContextOnUserGesture = initializeAudioContextOnUserGesture;

console.log("audioContextCoreInit.js loaded.");
