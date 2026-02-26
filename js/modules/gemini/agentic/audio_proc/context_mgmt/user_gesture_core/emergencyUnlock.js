/**
 * emergencyUnlock.js
 * Handles emergency audio unlocking for edge cases and iOS devices.
 */

window.UserGestureCore = window.UserGestureCore || {};

window.UserGestureCore.EmergencyUnlock = {
    setupEmergencyAudioUnlock: function () {
        console.log("Setting up emergency audio unlock listeners");

        const emergencyUnlock = async (event) => {
            console.log(`Emergency audio unlock triggered by ${event.type}`);

            try {
                // Aggressive unlock attempt
                if (window.AudioProcessingControlsAgentic && window.AudioProcessingControlsAgentic.isIOSDevice && window.AudioProcessingControlsAgentic.isIOSDevice() && window.AudioContextState && !window.AudioContextState.iOSAudioUnlocked) {
                    if (window.iOSAudioUnlock) await window.iOSAudioUnlock.unlockIOSAudio();
                }

                if (window.AudioContextState && !window.AudioContextState.audioContextInitialized && window.AudioProcessingControlsAgentic && window.AudioProcessingControlsAgentic.initializeAudioContextOnUserGesture) {
                    await window.AudioProcessingControlsAgentic.initializeAudioContextOnUserGesture();
                }

                if (window.AudioContextState && window.AudioContextState.audioInputContext && window.AudioContextState.audioInputContext.state === 'suspended') {
                    await window.AudioContextState.audioInputContext.resume();
                    console.log("Emergency audio context resume successful");
                }

                // Mark as unlocked globally
                window.audioContextUnlocked = true;
                localStorage.setItem('audioContextUnlocked', 'true');

                // Also unlock any existing container audio contexts
                const audioContainers = document.querySelectorAll('[data-audio-container]');
                for (const container of audioContainers) {
                    if (container.audioContext && container.audioContext.state === 'suspended') {
                        try {
                            await container.audioContext.resume();
                            console.log("Emergency resume for container audio context");
                        } catch (e) {
                            console.warn("Failed emergency resume for container:", e);
                        }
                    }
                }

                console.log("Emergency audio unlock completed successfully");

                // Remove this emergency listener
                document.removeEventListener(event.type, emergencyUnlock);

            } catch (error) {
                console.error("Emergency audio unlock failed:", error);
            }
        };

        // Set up emergency listeners on multiple event types
        const emergencyEvents = ['click', 'touchstart', 'touchend', 'mousedown', 'keydown', 'pointerdown'];
        emergencyEvents.forEach(eventType => {
            document.addEventListener(eventType, emergencyUnlock, { once: true, passive: true });
        });

        // Also set up a listener specifically for the text input area
        setTimeout(() => {
            const textInput = document.getElementById('textInput');
            if (textInput) {
                textInput.addEventListener('focus', emergencyUnlock, { once: true, passive: true });
                textInput.addEventListener('click', emergencyUnlock, { once: true, passive: true });
            }

            // And for any audio-related buttons
            const audioButtons = document.querySelectorAll('[id*="audio"], [class*="audio"], [id*="Audio"], [class*="Audio"]');
            audioButtons.forEach(button => {
                button.addEventListener('click', emergencyUnlock, { once: true, passive: true });
            });
        }, 1000);
    }
};

console.log("emergencyUnlock.js loaded.");
