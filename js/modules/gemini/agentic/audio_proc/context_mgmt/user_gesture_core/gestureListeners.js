/**
 * gestureListeners.js
 * Sets up event listeners to detect user gestures and trigger audio unlocking.
 */

window.UserGestureCore = window.UserGestureCore || {};

window.UserGestureCore.Listeners = {
    setupUserGestureListeners: function () {
        const UnlockingLogic = window.UserGestureCore.UnlockingLogic;

        // We'll implemented this slightly differently - instead of direct calls,
        // we'll setup the listeners to call the global initialize handler
        // which will be available on the main window object.

        const events = ['click', 'touchstart', 'keydown', 'mousedown'];
        let hasTriggered = false;

        const triggerInit = async (event) => {
            if (hasTriggered) return;
            hasTriggered = true;

            console.log(`User gesture detected via ${event.type}, initializing audio context`);

            // Use the global function which will be defined in audioContextManager.js
            if (window.AudioProcessingControlsAgentic && window.AudioProcessingControlsAgentic.initializeAudioContextOnUserGesture) {
                const success = await window.AudioProcessingControlsAgentic.initializeAudioContextOnUserGesture();

                if (success) {
                    UnlockingLogic.handleSuccessfulUnlock();
                }
            } else {
                console.warn("initializeAudioContextOnUserGesture not available yet, queuing unlock");
                // Retry shortly in case scripts load out of order
                setTimeout(async () => {
                    if (window.AudioProcessingControlsAgentic && window.AudioProcessingControlsAgentic.initializeAudioContextOnUserGesture) {
                        await window.AudioProcessingControlsAgentic.initializeAudioContextOnUserGesture();
                    }
                }, 500);
            }

            // Remove listeners after first successful initialization
            events.forEach(event => {
                document.removeEventListener(event, triggerInit);
            });
        };

        events.forEach(event => {
            document.addEventListener(event, triggerInit, { once: true, passive: true });
        });

        console.log("Enhanced user gesture listeners set up for audio context initialization");

        // Also set up more specific listeners for common UI interactions
        setTimeout(() => {
            // Listen for clicks on any audio-related buttons
            document.addEventListener('click', async (event) => {
                const target = event.target.closest('button, .mdl-button, [role="button"]');
                if (target && !window.audioContextUnlocked) {
                    console.log("Audio-related button clicked, ensuring audio context is ready");
                    if (window.AudioProcessingControlsAgentic && window.AudioProcessingControlsAgentic.ensureAudioContextReady) {
                        await window.AudioProcessingControlsAgentic.ensureAudioContextReady();
                        window.audioContextUnlocked = true;
                        localStorage.setItem('audioContextUnlocked', 'true');
                    }
                }
            }, { passive: true });
        }, 1000);
    }
};

console.log("gestureListeners.js loaded.");
