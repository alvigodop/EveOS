/**
 * audioContextState.js
 * 
 * Holds shared state for audio context management to allow
 * splitting functionalities across multiple files.
 */

window.AudioContextState = {
    audioInputContext: null,
    workletNode: null,
    audioContextInitialized: false,
    pendingAudioContextInit: false,

    // iOS-specific audio unlock mechanism variables
    iOSAudioUnlocked: false,
    emptyAudioElement: null
};

// Helper getters/setters for backward compatibility or ease of use if needed
// but direct access to window.AudioContextState is preferred for clarity in new modules.
