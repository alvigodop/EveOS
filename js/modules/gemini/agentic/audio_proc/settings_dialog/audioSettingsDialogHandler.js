window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

AudioProcessingControlsAgentic.initializeAudioSettingsDialog = function () {
    const audioSettingsButton = document.getElementById('audioSettingsButton');
    const audioSettingsDialog = document.getElementById('audioSettingsDialog');
    const audioSettingsCancel = document.getElementById('audioSettingsCancel');
    const audioSettingsSave = document.getElementById('audioSettingsSave');

    // Elements inside the dialog
    const autoAudioPlayToggle = document.getElementById('autoAudioPlayToggle');
    const sequentialAudioPlayToggle = document.getElementById('sequentialAudioPlayToggle');
    const playInterimAudioToggle = document.getElementById('playInterimAudioToggle');
    const processedAudioDelayInput = document.getElementById('processedAudioDelayInput');
    const playProcessedAudioToggle = document.getElementById('playProcessedAudioToggle');
    // New voice settings
    const speakingRateInput = document.getElementById('speakingRateInput');
    const pitchInput = document.getElementById('pitchInput');
    const stopAudioOnInputToggle = document.getElementById('stopAudioOnInputToggle');
    const transcriptionModeToggle = document.getElementById('transcriptionModeToggle');

    if (audioSettingsButton && audioSettingsDialog && audioSettingsCancel && audioSettingsSave &&
        autoAudioPlayToggle && sequentialAudioPlayToggle && playInterimAudioToggle &&
        processedAudioDelayInput && playProcessedAudioToggle && speakingRateInput && pitchInput && stopAudioOnInputToggle && transcriptionModeToggle) {
        audioSettingsButton.addEventListener('click', () => {
            // Populate dialog with current values before showing
            if (typeof window.autoAudioPlay !== 'undefined') {
                autoAudioPlayToggle.checked = window.autoAudioPlay;
            }
            if (typeof sequentialAudioPlay !== 'undefined') {
                sequentialAudioPlayToggle.checked = sequentialAudioPlay;
            }
            if (typeof playInterimAudio !== 'undefined') {
                playInterimAudioToggle.checked = playInterimAudio;
            }
            if (typeof processedAudioDelay !== 'undefined') {
                processedAudioDelayInput.value = processedAudioDelay;
            }
            if (typeof playProcessedAudio !== 'undefined') {
                playProcessedAudioToggle.checked = playProcessedAudio;
            }
            // Restore stopAudioOnInput state
            const stopAudio = localStorage.getItem('stopAudioOnInput') === 'true';
            stopAudioOnInputToggle.checked = stopAudio;

            // Restore transcription mode (Wrapped vs Raw) / Prompt Injection
            if (window.AudioProcessingControlsAgentic && window.AudioProcessingControlsAgentic.TranscriptionModeState) {
                const isEnabled = window.AudioProcessingControlsAgentic.TranscriptionModeState.isInjectionEnabled();
                transcriptionModeToggle.checked = isEnabled;

                const injectionPromptInput = document.getElementById('injectionPromptInput');
                if (injectionPromptInput) {
                    injectionPromptInput.value = window.AudioProcessingControlsAgentic.TranscriptionModeState.getInjectionPrompt();
                }

                const injectionPromptContainer = document.getElementById('injectionPromptContainer');
                if (injectionPromptContainer) {
                    injectionPromptContainer.style.display = isEnabled ? 'block' : 'none';
                }
            }

            const toggles = [autoAudioPlayToggle, sequentialAudioPlayToggle, playInterimAudioToggle, playProcessedAudioToggle, stopAudioOnInputToggle, transcriptionModeToggle];
            toggles.forEach(toggle => {
                if (toggle.parentElement && typeof componentHandler !== 'undefined' && toggle.parentElement.MaterialSwitch) {
                    toggle.parentElement.MaterialSwitch.checkToggleState();
                } else if (toggle.parentElement && toggle.parentElement.classList.contains('mdl-switch')) {
                    if (toggle.checked) {
                        toggle.parentElement.classList.add('is-checked');
                    } else {
                        toggle.parentElement.classList.remove('is-checked');
                    }
                }
            });

            if (typeof audioSettingsDialog.showModal === 'function') {
                audioSettingsDialog.showModal();
            } else {
                audioSettingsDialog.style.display = 'block';
            }
        });

        audioSettingsCancel.addEventListener('click', () => {
            // Restore original values on cancel
            if (typeof window.autoAudioPlay !== 'undefined') {
                autoAudioPlayToggle.checked = window.autoAudioPlay;
            }
            if (typeof sequentialAudioPlay !== 'undefined') {
                sequentialAudioPlayToggle.checked = sequentialAudioPlay;
            }
            if (typeof playInterimAudio !== 'undefined') {
                playInterimAudioToggle.checked = playInterimAudio;
            }
            if (typeof processedAudioDelay !== 'undefined') {
                processedAudioDelayInput.value = processedAudioDelay;
            }
            if (typeof playProcessedAudio !== 'undefined') {
                playProcessedAudioToggle.checked = playProcessedAudio;
            }
            // Restore stopAudioOnInput state
            const stopAudio = localStorage.getItem('stopAudioOnInput') === 'true';
            stopAudioOnInputToggle.checked = stopAudio;

            // Restore transcription mode / Prompt Injection
            if (window.AudioProcessingControlsAgentic && window.AudioProcessingControlsAgentic.TranscriptionModeState) {
                const isEnabled = window.AudioProcessingControlsAgentic.TranscriptionModeState.isInjectionEnabled();
                transcriptionModeToggle.checked = isEnabled;

                const injectionPromptInput = document.getElementById('injectionPromptInput');
                if (injectionPromptInput) {
                    injectionPromptInput.value = window.AudioProcessingControlsAgentic.TranscriptionModeState.getInjectionPrompt();
                }

                const injectionPromptContainer = document.getElementById('injectionPromptContainer');
                if (injectionPromptContainer) {
                    injectionPromptContainer.style.display = isEnabled ? 'block' : 'none';
                }
            }

            const toggles = [autoAudioPlayToggle, sequentialAudioPlayToggle, playInterimAudioToggle, playProcessedAudioToggle, stopAudioOnInputToggle, transcriptionModeToggle];
            toggles.forEach(toggle => {
                if (toggle.parentElement && typeof componentHandler !== 'undefined' && toggle.parentElement.MaterialSwitch) {
                    toggle.parentElement.MaterialSwitch.checkToggleState();
                } else if (toggle.parentElement && toggle.parentElement.classList.contains('mdl-switch')) {
                    if (toggle.checked) {
                        toggle.parentElement.classList.add('is-checked');
                    } else {
                        toggle.parentElement.classList.remove('is-checked');
                    }
                }
            });

            if (audioSettingsDialog.close) {
                audioSettingsDialog.close();
            } else {
                audioSettingsDialog.style.display = 'none';
            }
        });

        audioSettingsSave.addEventListener('click', () => {
            if (typeof playProcessedAudio !== 'undefined') {
                playProcessedAudio = playProcessedAudioToggle.checked;
                localStorage.setItem('playProcessedAudio', playProcessedAudio.toString());
            }

            if (typeof processedAudioDelay !== 'undefined') {
                processedAudioDelay = parseInt(processedAudioDelayInput.value, 10) || 0;
                localStorage.setItem('processedAudioDelay', processedAudioDelay.toString());
            }

            if (typeof window.autoAudioPlay !== 'undefined') {
                window.autoAudioPlay = autoAudioPlayToggle.checked;
                localStorage.setItem('autoAudioPlay', window.autoAudioPlay.toString());
            }

            if (typeof sequentialAudioPlay !== 'undefined') {
                sequentialAudioPlay = sequentialAudioPlayToggle.checked;
                localStorage.setItem('sequentialAudioPlay', sequentialAudioPlay.toString());
                if (typeof displayMessage === 'function') {
                    displayMessage(`System Message: Sequential Audio Play ${sequentialAudioPlay ? 'enabled' : 'disabled'}`);
                }
            }

            if (typeof playInterimAudio !== 'undefined') {
                playInterimAudio = playInterimAudioToggle.checked;
                localStorage.setItem('playInterimAudio', playInterimAudio.toString());
            }

            // Save voice settings
            localStorage.setItem('speakingRate', speakingRateInput.value);
            localStorage.setItem('pitch', pitchInput.value);

            // Save prompt injection settings
            if (window.AudioProcessingControlsAgentic && window.AudioProcessingControlsAgentic.TranscriptionModeState) {
                const isEnabled = transcriptionModeToggle.checked;
                window.AudioProcessingControlsAgentic.TranscriptionModeState.setInjectionEnabled(isEnabled);

                const injectionPromptInput = document.getElementById('injectionPromptInput');
                if (injectionPromptInput) {
                    window.AudioProcessingControlsAgentic.TranscriptionModeState.setInjectionPrompt(injectionPromptInput.value);
                }
            }

            if (stopAudioOnInputToggle.checked && typeof displayMessage === 'function') {
                displayMessage("System Message: Stop Audio on Input enabled.", true);
            }

            if (audioSettingsDialog.close) {
                audioSettingsDialog.close();
            } else {
                audioSettingsDialog.style.display = 'none';
            }
        });
    } else {
        console.warn('One or more audio settings dialog elements not found. Handler will not be fully initialized.');
    }
};

// The initialization will now be triggered externally by pageInitializer.js
// window.addEventListener('load', () => {
//     setTimeout(() => {
//         initializeAudioSettingsDialog();
//     }, 100);
// }); 