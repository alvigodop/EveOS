/**
 * transcriptionModeToggleHandler.js
 * Handles the UI toggle for switching between transcription modes
 */

function initializeTranscriptionModeToggle() {
    const transcriptionModeToggle = document.getElementById('transcriptionModeToggle');

    if (!transcriptionModeToggle) {
        console.warn('[Transcription Mode] Toggle element not found');
        return;
    }

    // Restore display mode from state
    const isInjectionEnabled = window.AudioProcessingControlsAgentic.TranscriptionModeState.isInjectionEnabled();
    transcriptionModeToggle.checked = isInjectionEnabled;

    const injectionPromptContainer = document.getElementById('injectionPromptContainer');
    const injectionPromptInput = document.getElementById('injectionPromptInput');

    if (injectionPromptContainer) {
        injectionPromptContainer.style.display = isInjectionEnabled ? 'block' : 'none';
    }

    if (injectionPromptInput) {
        injectionPromptInput.value = window.AudioProcessingControlsAgentic.TranscriptionModeState.getInjectionPrompt();
    }

    // Update MDL material switch if available
    if (transcriptionModeToggle.parentElement && typeof componentHandler !== 'undefined' && transcriptionModeToggle.parentElement.MaterialSwitch) {
        transcriptionModeToggle.parentElement.MaterialSwitch.checkToggleState();
    }

    // Add change listener
    transcriptionModeToggle.addEventListener('change', function () {
        const enabled = this.checked;
        window.AudioProcessingControlsAgentic.TranscriptionModeState.setInjectionEnabled(enabled);

        if (injectionPromptContainer) {
            injectionPromptContainer.style.display = enabled ? 'block' : 'none';
        }

        console.log(`[Prompt Injection] User toggled: ${enabled ? 'ON' : 'OFF'}`);
    });

    if (injectionPromptInput) {
        injectionPromptInput.addEventListener('input', function () {
            window.AudioProcessingControlsAgentic.TranscriptionModeState.setInjectionPrompt(this.value);
        });
    }

    console.log('[Transcription Mode Toggle] Initialized');
}

// Export for global access
window.initializeTranscriptionModeToggle = initializeTranscriptionModeToggle;
