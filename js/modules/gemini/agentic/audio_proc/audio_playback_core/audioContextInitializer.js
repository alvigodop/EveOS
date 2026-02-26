// Logic for initializing and verifying audio context for a container
window.AudioContextInitializer = window.AudioContextInitializer || {};

window.AudioContextInitializer.getOrInitializeContext = async function (container) {
    // Enhanced audio context readiness check
    if (typeof window.AudioProcessingControlsAgentic !== 'undefined' &&
        typeof window.AudioProcessingControlsAgentic.ensureAudioContextReady === 'function') {

        const audioReady = await window.AudioProcessingControlsAgentic.ensureAudioContextReady();
        if (!audioReady) {
            console.warn("Audio context not ready after enhanced check");
            // We return null here to signal the caller to try fallback or handle error
            return null;
        }
    }

    // Create context if needed
    if (!container.audioContext) {
        if (typeof window.AudioProcessingControlsAgentic !== 'undefined' &&
            typeof window.AudioProcessingControlsAgentic.createContainerAudioContext === 'function') {
            container.audioContext = await window.AudioProcessingControlsAgentic.createContainerAudioContext(container);
            if (!container.audioContext) {
                throw new Error("Failed to create container audio context");
            }
        } else {
            // Fallback to direct creation
            try {
                container.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 24000
                });
                console.log("Created new audio context (fallback method)");
            } catch (contextError) {
                console.error("Failed to create AudioContext:", contextError);
                throw contextError;
            }
        }
    } else {
        console.log("Using existing audio context");
    }

    // Ensure context is running
    if (container.audioContext.state === 'suspended') {
        await this.resumeAudioContext(container.audioContext);
    }

    return container.audioContext;
};

window.AudioContextInitializer.resumeAudioContext = async function (audioContext) {
    // Check if we have permission to resume
    const wasUnlocked = localStorage.getItem('audioContextUnlocked') === 'true' || window.audioContextUnlocked;

    if (wasUnlocked) {
        try {
            console.log("Audio context suspended, attempting multiple resume attempts");

            // Try multiple resume attempts with progressive delays
            for (let attempt = 1; attempt <= 3; attempt++) {
                await audioContext.resume();
                console.log(`Audio context resume attempt ${attempt}, state: ${audioContext.state}`);

                if (audioContext.state === 'running') {
                    break;
                } else if (attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 100 * attempt));
                }
            }

            if (audioContext.state !== 'running') {
                console.warn("Audio context still not running after multiple attempts");
                throw new Error("AudioContext failed to resume after multiple attempts");
            }

            console.log("Audio context successfully resumed");
        } catch (resumeError) {
            console.warn("Failed to resume audio context:", resumeError);
            // We don't throw here to allow caller to potentially proceed or retry later
        }
    } else {
        console.log("Audio context suspended and no user gesture detected - setup listener needed");
        // We handle the listener setup logic in the caller usually, or we can add a helper here
        this.setupResumeOnInteraction(audioContext);
    }
};

window.AudioContextInitializer.setupResumeOnInteraction = function (audioContext) {
    const resumeAndRetry = async () => {
        try {
            await audioContext.resume();
            console.log("Audio context resumed after user interaction");
            window.audioContextUnlocked = true;
            localStorage.setItem('audioContextUnlocked', 'true');
        } catch (e) {
            console.warn("Failed to resume audio context after user interaction:", e);
        }
        document.removeEventListener('click', resumeAndRetry);
        document.removeEventListener('touchstart', resumeAndRetry);
    };
    document.addEventListener('click', resumeAndRetry, { once: true, passive: true });
    document.addEventListener('touchstart', resumeAndRetry, { once: true, passive: true });
};
