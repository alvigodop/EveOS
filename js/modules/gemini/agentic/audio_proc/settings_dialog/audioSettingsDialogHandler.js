window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

function ensureAudioSettingsDialogTheme(audioSettingsDialog) {
    if (!audioSettingsDialog) return;
    audioSettingsDialog.classList.add('eve-audio-settings-dialog');
    audioSettingsDialog.setAttribute('aria-modal', 'true');
    audioSettingsDialog.setAttribute('aria-label', 'Audio Processing Settings');

    if (document.getElementById('eveAudioSettingsDialogTheme')) return;
    const style = document.createElement('style');
    style.id = 'eveAudioSettingsDialogTheme';
    style.textContent = `
        #audioSettingsDialog.eve-audio-settings-dialog {
            box-sizing: border-box !important;
            width: min(520px, calc(100vw - 32px)) !important;
            max-width: 520px !important;
            max-height: min(780px, calc(100vh - 32px)) !important;
            margin: auto !important;
            padding: 0 !important;
            overflow: hidden !important;
            border: 1px solid rgba(66, 208, 230, .18) !important;
            border-radius: 20px !important;
            background: #0b141d !important;
            color: #e7f7fa !important;
            box-shadow: 0 28px 80px rgba(0, 0, 0, .58), 0 0 0 1px rgba(0, 210, 235, .04) inset !important;
            font-family: Inter, Roboto, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog::backdrop {
            background: rgba(1, 7, 11, .78) !important;
            backdrop-filter: blur(7px);
        }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-dialog__title {
            margin: 0 !important;
            padding: 30px 28px 12px !important;
            color: #f2fbfd !important;
            font-size: 23px !important;
            line-height: 1.15 !important;
            font-weight: 650 !important;
            letter-spacing: -.025em !important;
            background: linear-gradient(180deg, rgba(8, 54, 67, .52), rgba(11, 20, 29, 0)) !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-dialog__title::before {
            content: "AGENTIC FUNCTIONS  ·  AUDIO";
            display: block;
            margin-bottom: 8px;
            color: #2ed3ea;
            font: 700 10px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            letter-spacing: .15em;
        }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-dialog__content {
            box-sizing: border-box !important;
            max-height: calc(min(780px, 100vh - 32px) - 132px) !important;
            padding: 8px 28px 22px !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            color: #aebfc5 !important;
            scrollbar-width: thin;
            scrollbar-color: #1cbad1 #0b141d;
        }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-dialog__content::-webkit-scrollbar { width: 8px; }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-dialog__content::-webkit-scrollbar-track { background: #0b141d; }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-dialog__content::-webkit-scrollbar-thumb {
            border: 2px solid #0b141d;
            border-radius: 99px;
            background: #1cbad1;
        }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-dialog__actions {
            box-sizing: border-box !important;
            min-height: 68px !important;
            padding: 14px 22px !important;
            gap: 10px !important;
            border-top: 1px solid rgba(115, 157, 168, .14) !important;
            background: rgba(7, 14, 21, .96) !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-dialog__actions .mdl-button,
        #audioSettingsDialog.eve-audio-settings-dialog #audioSettingsSave,
        #audioSettingsDialog.eve-audio-settings-dialog #audioSettingsCancel {
            min-width: 92px !important;
            min-height: 38px !important;
            padding: 0 16px !important;
            border: 1px solid rgba(90, 140, 153, .24) !important;
            border-radius: 10px !important;
            color: #cfe0e5 !important;
            background: #111d26 !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            letter-spacing: .04em !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog #audioSettingsSave {
            border-color: #18bfd7 !important;
            background: #16bfd6 !important;
            color: #031014 !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog hr {
            margin: 18px 0 !important;
            border: 0 !important;
            border-top: 1px solid rgba(115, 157, 168, .16) !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog label,
        #audioSettingsDialog.eve-audio-settings-dialog p,
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-switch__label,
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-textfield__label {
            color: #aebfc5 !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog b,
        #audioSettingsDialog.eve-audio-settings-dialog strong {
            color: #e7f7fa !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog input:not([type="checkbox"]):not([type="radio"]),
        #audioSettingsDialog.eve-audio-settings-dialog select,
        #audioSettingsDialog.eve-audio-settings-dialog textarea {
            box-sizing: border-box !important;
            width: 100% !important;
            min-height: 40px !important;
            padding: 9px 11px !important;
            border: 1px solid #263943 !important;
            border-radius: 9px !important;
            outline: none !important;
            background: #081119 !important;
            color: #e8f7fa !important;
            caret-color: #28cee5 !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog textarea { min-height: 86px !important; resize: vertical !important; }
        #audioSettingsDialog.eve-audio-settings-dialog input:focus,
        #audioSettingsDialog.eve-audio-settings-dialog select:focus,
        #audioSettingsDialog.eve-audio-settings-dialog textarea:focus {
            border-color: #23c4dc !important;
            box-shadow: 0 0 0 2px rgba(35, 196, 220, .13) !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog input:disabled,
        #audioSettingsDialog.eve-audio-settings-dialog select:disabled,
        #audioSettingsDialog.eve-audio-settings-dialog textarea:disabled {
            opacity: .48 !important;
            cursor: not-allowed !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-switch { min-height: 30px !important; }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-switch__track { background: #24323a !important; }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-switch__thumb { background: #7d8e95 !important; }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-switch.is-checked .mdl-switch__track {
            background: rgba(36, 199, 221, .35) !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-switch.is-checked .mdl-switch__thumb {
            background: #22c8df !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-textfield { width: 100% !important; }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-textfield__input {
            border-bottom-color: #30454f !important;
        }
        #audioSettingsDialog.eve-audio-settings-dialog .mdl-textfield__label::after { background-color: #22c8df !important; }
        @media (max-width: 560px), (max-height: 620px) {
            #audioSettingsDialog.eve-audio-settings-dialog {
                width: calc(100vw - 18px) !important;
                max-height: calc(100vh - 18px) !important;
                border-radius: 15px !important;
            }
            #audioSettingsDialog.eve-audio-settings-dialog .mdl-dialog__title { padding: 22px 18px 10px !important; }
            #audioSettingsDialog.eve-audio-settings-dialog .mdl-dialog__content {
                max-height: calc(100vh - 116px) !important;
                padding: 6px 18px 18px !important;
            }
            #audioSettingsDialog.eve-audio-settings-dialog .mdl-dialog__actions { padding: 11px 14px !important; }
        }
    `;
    document.head.appendChild(style);
}

AudioProcessingControlsAgentic.initializeAudioSettingsDialog = function () {
    const audioSettingsButton = document.getElementById('audioSettingsButton');
    const audioSettingsDialog = document.getElementById('audioSettingsDialog');
    const audioSettingsCancel = document.getElementById('audioSettingsCancel');
    const audioSettingsSave = document.getElementById('audioSettingsSave');

    ensureAudioSettingsDialogTheme(audioSettingsDialog);

    // Elements inside the dialog
    const autoAudioPlayToggle = document.getElementById('autoAudioPlayToggle');
    const sequentialAudioPlayToggle = document.getElementById('sequentialAudioPlayToggle');
    const playInterimAudioToggle = document.getElementById('playInterimAudioToggle');
    const processedAudioDelayInput = document.getElementById('processedAudioDelayInput');
    const playProcessedAudioToggle = document.getElementById('playProcessedAudioToggle');
    const speakingRateInput = document.getElementById('speakingRateInput');
    const pitchInput = document.getElementById('pitchInput');
    const stopAudioOnInputToggle = document.getElementById('stopAudioOnInputToggle');
    const transcriptionModeToggle = document.getElementById('transcriptionModeToggle');

    if (audioSettingsButton && audioSettingsDialog && audioSettingsCancel && audioSettingsSave &&
        autoAudioPlayToggle && sequentialAudioPlayToggle && playInterimAudioToggle &&
        processedAudioDelayInput && playProcessedAudioToggle && speakingRateInput && pitchInput && stopAudioOnInputToggle && transcriptionModeToggle) {
        audioSettingsButton.addEventListener('click', () => {
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
            const stopAudio = localStorage.getItem('stopAudioOnInput') === 'true';
            stopAudioOnInputToggle.checked = stopAudio;

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
            const stopAudio = localStorage.getItem('stopAudioOnInput') === 'true';
            stopAudioOnInputToggle.checked = stopAudio;

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

            localStorage.setItem('speakingRate', speakingRateInput.value);
            localStorage.setItem('pitch', pitchInput.value);

            if (window.AudioProcessingControlsAgentic && window.AudioProcessingControlsAgentic.TranscriptionModeState) {
                const isEnabled = transcriptionModeToggle.checked;
                window.AudioProcessingControlsAgentic.TranscriptionModeState.setInjectionEnabled(isEnabled);

                const injectionPromptInput = document.getElementById('injectionPromptInput');
                if (injectionPromptInput) {
                    window.AudioProcessingControlsAgentic.TranscriptionModeState.setInjectionPrompt(injectionPromptInput.value);
                }
            }

            if (stopAudioOnInputToggle.checked && typeof displayMessage === 'function') {
                displayMessage('System Message: Stop Audio on Input enabled.', true);
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
