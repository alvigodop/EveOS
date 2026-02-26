/**
 * unlockingLogic.js
 * Handles the logic for resuming and unlocking audio contexts.
 */

window.UserGestureCore = window.UserGestureCore || {};

window.UserGestureCore.UnlockingLogic = {
    // Internal helper to handle successful unlock logic
    handleSuccessfulUnlock: async function () {
        const Detection = window.UserGestureCore.GestureDetection;

        // Explicitly unlock audio context for all existing contexts
        try {
            // Check for any existing AudioContext instances and resume them
            if (window.AudioContextState && window.AudioContextState.audioInputContext && window.AudioContextState.audioInputContext.state === 'suspended') {
                await window.AudioContextState.audioInputContext.resume();
                console.log("Resumed main audio input context");
            }

            if (window.audioInputContext && window.audioInputContext.state === 'suspended') {
                await window.audioInputContext.resume();
            }

            // Also check for any container audio contexts that might exist
            const audioContainers = document.querySelectorAll('[data-audio-container]');
            audioContainers.forEach(async (container) => {
                if (container.audioContext && container.audioContext.state === 'suspended') {
                    try {
                        await container.audioContext.resume();
                        console.log("Resumed container audio context");
                    } catch (e) {
                        console.warn("Failed to resume container audio context:", e);
                    }
                }
            });

            // Store flag that user gesture has been detected
            if (Detection) {
                Detection.markAsUnlocked();
            } else {
                window.audioContextUnlocked = true;
                localStorage.setItem('audioContextUnlocked', 'true');
            }

        } catch (resumeError) {
            console.warn("Error resuming audio contexts after user gesture:", resumeError);
        }
    }
};

console.log("unlockingLogic.js loaded.");
