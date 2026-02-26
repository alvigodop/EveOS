// js/modules/gemini/Session_Controls_Agentic/session_controls_settings/sessionControlsSettingsHandler.js
// Manages UI and logic for session control settings (keep-alive, cleanup interval)

// Initialize the SessionControlsAgentic namespace if it doesn't exist
if (!window.SessionControlsAgentic) {
    window.SessionControlsAgentic = {};
}

// Define the session controls settings handler
window.SessionControlsAgentic.initializeSessionControlsSettings = function (getWebSocket, displayMessageFunc) {
    console.log("Initializing session controls settings...");

    // Get all required UI elements
    const elements = {
        button: document.getElementById('sessionControlsSettingsButton'),
        dialog: document.getElementById('sessionControlsDialog'),
        saveBtn: document.getElementById('sessionControlsSave'),
        cancelBtn: document.getElementById('sessionControlsCancel'),
        keepAliveToggle: document.getElementById('keepAliveToggleSess'),
        heartbeatInput: document.getElementById('heartbeatIntervalInputSess'),
        cleanupInput: document.getElementById('cleanupIntervalInputSess'),
        // New elements
        modelSelect: document.getElementById('modelSelectSess'),
        temperatureInput: document.getElementById('temperatureInputSess'),
        topKInput: document.getElementById('topKInputSess'),
        topPInput: document.getElementById('topPInputSess'),
        maxTokensInput: document.getElementById('maxTokensInputSess'),
        apiKeyInput: document.getElementById('apiKeyInputSess'),
        // New elements
        systemInstructionInput: document.getElementById('systemInstructionInputSess'),
        safetyLevelSelect: document.getElementById('safetyLevelSelectSess'),
        speakingRateInput: document.getElementById('speakingRateInputSess'),
        pitchInput: document.getElementById('pitchInputSess'),
        responseTimeoutInput: document.getElementById('responseTimeoutInputSess')
    };

    // Log which elements were found/not found
    console.log("Session controls UI elements found:", {
        button: !!elements.button,
        dialog: !!elements.dialog,
        saveBtn: !!elements.saveBtn,
        cancelBtn: !!elements.cancelBtn,
        modelSelect: !!elements.modelSelect
    });

    // Ensure all required elements exist
    if (!elements.button || !elements.dialog || !elements.saveBtn || !elements.cancelBtn) {
        console.error('Session controls UI elements not found');
        return;
    }

    // Initialize dialog if needed
    if (typeof elements.dialog.showModal !== 'function' && typeof dialogPolyfill !== 'undefined') {
        dialogPolyfill.registerDialog(elements.dialog);
    }

    // Restore saved values
    function restoreSettings() {
        if (elements.keepAliveToggle) {
            const keepAlive = localStorage.getItem('keepSessionAlive') === 'true';
            elements.keepAliveToggle.checked = keepAlive;

            // Update MDL component state if needed
            if (elements.keepAliveToggle.parentElement) {
                if (elements.keepAliveToggle.parentElement.MaterialSwitch) {
                    elements.keepAliveToggle.parentElement.MaterialSwitch.checkToggleState();
                } else if (elements.keepAliveToggle.parentElement.classList.contains('is-upgraded')) {
                    if (keepAlive) {
                        elements.keepAliveToggle.parentElement.classList.add('is-checked');
                    } else {
                        elements.keepAliveToggle.parentElement.classList.remove('is-checked');
                    }
                }
            }
        }

        if (elements.heartbeatInput) {
            elements.heartbeatInput.value = localStorage.getItem('heartbeatIntervalSec') || '60';
        }

        if (elements.cleanupInput) {
            elements.cleanupInput.value = localStorage.getItem('cleanupInterval') || '60';
        }

        // Restore new settings
        if (elements.modelSelect) {
            elements.modelSelect.value = localStorage.getItem('selectedModel') || 'gemini-2.5-flash-native-audio-latest';
        }
        if (elements.temperatureInput) {
            elements.temperatureInput.value = localStorage.getItem('generationTemperature') || '0.9';
        }
        if (elements.topKInput) {
            elements.topKInput.value = localStorage.getItem('generationTopK') || '1';
        }
        if (elements.topPInput) {
            elements.topPInput.value = localStorage.getItem('generationTopP') || '1';
        }
        if (elements.maxTokensInput) {
            elements.maxTokensInput.value = localStorage.getItem('generationMaxTokens') || '2048';
        }

        // Restore expanded settings
        if (elements.systemInstructionInput) {
            elements.systemInstructionInput.value = localStorage.getItem('systemInstruction') || '';
        }
        if (elements.safetyLevelSelect) {
            elements.safetyLevelSelect.value = localStorage.getItem('safetyLevel') || 'high';
        }
        if (elements.speakingRateInput) {
            elements.speakingRateInput.value = localStorage.getItem('speakingRate') || '1.0';
        }
        if (elements.pitchInput) {
            elements.pitchInput.value = localStorage.getItem('pitch') || '0';
        }
        if (elements.responseTimeoutInput) {
            elements.responseTimeoutInput.value = localStorage.getItem('responseTimeout') || '75';
        }
        if (elements.apiKeyInput) {
            elements.apiKeyInput.value = localStorage.getItem('geminiApiKey') || '';
        }
    }

    // Add click handler for settings button
    elements.button.addEventListener('click', () => {
        console.log("Session controls button clicked");
        restoreSettings();

        try {
            if (typeof elements.dialog.showModal === 'function') {
                elements.dialog.showModal();
            } else {
                elements.dialog.style.display = 'block';
            }
        } catch (error) {
            console.error('Error showing dialog:', error);
            displayMessageFunc('System Message: Error showing settings dialog', true);
        }
    });

    // Add click handler for cancel button
    elements.cancelBtn.addEventListener('click', () => {
        try {
            if (typeof elements.dialog.close === 'function') {
                elements.dialog.close();
            } else {
                elements.dialog.style.display = 'none';
            }
        } catch (error) {
            console.error('Error closing dialog:', error);
        }
    });

    // Add click handler for save button
    elements.saveBtn.addEventListener('click', () => {
        try {
            const keep = elements.keepAliveToggle ? elements.keepAliveToggle.checked : false;
            const hb = parseInt(elements.heartbeatInput ? elements.heartbeatInput.value : '60', 10);
            const ci = parseInt(elements.cleanupInput ? elements.cleanupInput.value : '60', 10);

            // Get new values
            const model = elements.modelSelect ? elements.modelSelect.value : 'gemini-2.5-flash-native-audio-latest';
            const temp = parseFloat(elements.temperatureInput ? elements.temperatureInput.value : '0.9');
            const topK = parseInt(elements.topKInput ? elements.topKInput.value : '1', 10);
            const topP = parseFloat(elements.topPInput ? elements.topPInput.value : '1.0');
            const maxTokens = parseInt(elements.maxTokensInput ? elements.maxTokensInput.value : '2048', 10);

            // New settings
            const sysInstr = elements.systemInstructionInput ? elements.systemInstructionInput.value : '';
            const safeLvl = elements.safetyLevelSelect ? elements.safetyLevelSelect.value : 'high';
            const rate = parseFloat(elements.speakingRateInput ? elements.speakingRateInput.value : '1.0');
            const pitch = parseInt(elements.pitchInput ? elements.pitchInput.value : '0', 10);
            const respTimeout = parseInt(elements.responseTimeoutInput ? elements.responseTimeoutInput.value : '75', 10);

            // Save to localStorage
            localStorage.setItem('keepSessionAlive', keep.toString());
            localStorage.setItem('heartbeatIntervalSec', hb.toString());
            localStorage.setItem('cleanupInterval', ci.toString());

            // Save new settings
            localStorage.setItem('selectedModel', model);
            localStorage.setItem('generationTemperature', temp.toString());
            localStorage.setItem('generationTopK', topK.toString());
            localStorage.setItem('generationTopP', topP.toString());
            localStorage.setItem('generationMaxTokens', maxTokens.toString());

            localStorage.setItem('systemInstruction', sysInstr);
            localStorage.setItem('safetyLevel', safeLvl);
            localStorage.setItem('speakingRate', rate.toString());
            localStorage.setItem('pitch', pitch.toString());
            localStorage.setItem('responseTimeout', respTimeout.toString());

            if (elements.apiKeyInput) {
                localStorage.setItem('geminiApiKey', elements.apiKeyInput.value);
            }

            // Send cleanup/keep-alive to server if connected (other settings take effect on next connection)
            const currentWebSocket = getWebSocket();
            if (currentWebSocket && currentWebSocket.readyState === WebSocket.OPEN) {
                currentWebSocket.send(JSON.stringify({ command: 'set_cleanup_interval', interval: ci }));

                // Construct a summary message
                let msg = `System Message: Settings saved. Cleanup: ${ci}s`;
                if (keep) msg += `, Keep-alive: ${hb}s`;
                msg += `. Model: ${model}.`;
                msg += ` (Reconnect to apply Model/Gen config)`;

                displayMessageFunc(msg, true);
            } else {
                displayMessageFunc('System Message: Settings saved (Reconnect to apply)', true);
            }

            // Close dialog
            if (typeof elements.dialog.close === 'function') {
                elements.dialog.close();
            } else {
                elements.dialog.style.display = 'none';
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            displayMessageFunc('System Message: Error saving settings', true);
        }
    });
};

// The initialization is now triggered by pageInitializer.js after the HTML component is loaded. 