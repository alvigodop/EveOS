/**
 * containerContextFactory.js
 * Enhanced function to create audio context for containers with iOS support.
 */

console.log("containerContextFactory.js loading...");

window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

async function createContainerAudioContext(container) {
    try {
        const state = window.AudioContextState;
        const helpers = window.AudioProcessingControlsAgentic;

        // Check if global user gesture has been detected
        const wasUnlocked = localStorage.getItem('audioContextUnlocked') === 'true' || window.audioContextUnlocked;

        // iOS-specific unlock
        if (helpers.isIOSDevice && helpers.isIOSDevice() && !state.iOSAudioUnlocked) {
            if (window.iOSAudioUnlock) await window.iOSAudioUnlock.unlockIOSAudio();
        }

        if (!container.audioContext) {
            container.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 24000
            });
            console.log("Created container audio context");
        }

        // Enhanced resume logic with multiple attempts
        if (container.audioContext.state === 'suspended') {
            if (wasUnlocked || state.iOSAudioUnlocked) {
                // Try multiple resume attempts
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        await container.audioContext.resume();
                        console.log(`Container audio context resumed on attempt ${attempt}`);
                        break;
                    } catch (e) {
                        if (attempt === 3) {
                            console.warn("Failed to resume container audio context after 3 attempts:", e);
                        } else {
                            await new Promise(resolve => setTimeout(resolve, 50 * attempt));
                        }
                    }
                }
            } else {
                console.log("Container audio context suspended - setting up unlock listener");

                // Set up one-time listener to resume on next interaction
                const resumeOnInteraction = async (event) => {
                    try {
                        if (helpers.isIOSDevice && helpers.isIOSDevice() && !state.iOSAudioUnlocked) {
                            if (window.iOSAudioUnlock) await window.iOSAudioUnlock.unlockIOSAudio();
                        }

                        if (container.audioContext.state === 'suspended') {
                            await container.audioContext.resume();
                            console.log("Container audio context resumed after user interaction");
                            window.audioContextUnlocked = true;
                            localStorage.setItem('audioContextUnlocked', 'true');
                        }
                    } catch (e) {
                        console.warn("Failed to resume container audio context:", e);
                    }

                    // Remove listeners
                    document.removeEventListener('click', resumeOnInteraction);
                    document.removeEventListener('touchstart', resumeOnInteraction);
                };

                document.addEventListener('click', resumeOnInteraction, { once: true, passive: true });
                document.addEventListener('touchstart', resumeOnInteraction, { once: true, passive: true });
            }
        }

        return container.audioContext;
    } catch (error) {
        console.error("Error creating container audio context:", error);
        return null;
    }
}

// Export factory function
window.AudioProcessingControlsAgentic.createContainerAudioContext = createContainerAudioContext;

console.log("containerContextFactory.js loaded.");
