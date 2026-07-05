// Session Controls settings, including secure Gemini credential handoff.
(function () {
    'use strict';

    window.SessionControlsAgentic = window.SessionControlsAgentic || {};

    const STORAGE_FIELDS = {
        heartbeatInput: ['heartbeatIntervalSec', '60'],
        cleanupInput: ['cleanupInterval', '60'],
        responseTimeoutInput: ['responseTimeout', '75'],
        modelSelect: ['selectedModel', 'gemini-2.5-flash-native-audio-latest'],
        textBrainModelSelect: ['textBrainModel', 'gemini-2.5-flash-lite'],
        temperatureInput: ['generationTemperature', '0.9'],
        topKInput: ['generationTopK', '1'],
        topPInput: ['generationTopP', '1'],
        maxTokensInput: ['generationMaxTokens', '2048'],
        systemInstructionInput: ['systemInstruction', ''],
        safetyLevelSelect: ['safetyLevel', 'high'],
        speakingRateInput: ['speakingRate', '1.0'],
        pitchInput: ['pitch', '0']
    };

    function getElements() {
        return {
            button: document.getElementById('sessionControlsSettingsButton'),
            dialog: document.getElementById('sessionControlsDialog'),
            saveBtn: document.getElementById('sessionControlsSave'),
            cancelBtn: document.getElementById('sessionControlsCancel'),
            closeBtn: document.getElementById('sessionControlsClose'),
            keepAliveToggle: document.getElementById('keepAliveToggleSess'),
            heartbeatInput: document.getElementById('heartbeatIntervalInputSess'),
            cleanupInput: document.getElementById('cleanupIntervalInputSess'),
            responseTimeoutInput: document.getElementById('responseTimeoutInputSess'),
            modelSelect: document.getElementById('modelSelectSess'),
            textBrainModelSelect: document.getElementById('textBrainModelSelectSess'),
            temperatureInput: document.getElementById('temperatureInputSess'),
            topKInput: document.getElementById('topKInputSess'),
            topPInput: document.getElementById('topPInputSess'),
            maxTokensInput: document.getElementById('maxTokensInputSess'),
            apiKeyInput: document.getElementById('apiKeyInputSess'),
            apiKeyReveal: document.getElementById('geminiApiKeyReveal'),
            credentialStatus: document.getElementById('geminiCredentialStatus'),
            credentialBadge: document.getElementById('geminiCredentialBadge'),
            systemInstructionInput: document.getElementById('systemInstructionInputSess'),
            safetyLevelSelect: document.getElementById('safetyLevelSelectSess'),
            speakingRateInput: document.getElementById('speakingRateInputSess'),
            pitchInput: document.getElementById('pitchInputSess')
        };
    }

    function safeStorageGet(key, fallback) {
        try {
            return localStorage.getItem(key) ?? fallback;
        } catch (error) {
            return fallback;
        }
    }

    function safeStorageSet(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch (error) {
            console.warn(`[SessionControls] Could not persist ${key}:`, error);
        }
    }

    function setCredentialStatus(elements, state, message) {
        if (elements.credentialBadge) {
            elements.credentialBadge.dataset.state = state;
            elements.credentialBadge.textContent = {
                ready: 'Secured',
                saving: 'Saving',
                error: 'Needs attention',
                missing: 'Not set'
            }[state] || 'Checking';
        }
        if (elements.credentialStatus) elements.credentialStatus.textContent = message;
    }

    async function refreshCredentialStatus(elements) {
        setCredentialStatus(elements, 'checking', 'Checking the encrypted local credential vault...');
        const control = window.GeminiServerControl;
        if (!control?.syncCredentials) {
            setCredentialStatus(elements, 'error', 'The local Gemini credential service is unavailable.');
            return false;
        }
        const payload = await control.syncCredentials();
        if (payload?.configured) {
            setCredentialStatus(elements, 'ready', 'An API key is secured in the local Windows credential vault.');
            return true;
        }
        if (payload?.message && payload.ok === false) {
            setCredentialStatus(elements, 'error', payload.message);
            return false;
        }
        setCredentialStatus(elements, 'missing', 'No API key is saved. Paste one here to secure it for Gemini startup.');
        return false;
    }

    function restoreSettings(elements) {
        Object.entries(STORAGE_FIELDS).forEach(function ([elementKey, storageConfig]) {
            if (elements[elementKey]) {
                elements[elementKey].value = elementKey === 'systemInstructionInput' && window.GeminiInstructionState?.getBaseInstruction
                    ? window.GeminiInstructionState.getBaseInstruction()
                    : safeStorageGet(storageConfig[0], storageConfig[1]);
            }
        });
        if (elements.keepAliveToggle) {
            const keepAlive = safeStorageGet('keepSessionAlive', 'false') === 'true';
            elements.keepAliveToggle.checked = keepAlive;
            elements.keepAliveToggle.parentElement?.MaterialSwitch?.checkToggleState?.();
        }
        if (elements.apiKeyInput) {
            // Only legacy unsynchronized keys appear here. Secured keys are never read back into the page.
            elements.apiKeyInput.value = safeStorageGet('geminiApiKey', '');
            elements.apiKeyInput.type = 'password';
        }
    }

    function persistSettings(elements) {
        safeStorageSet('keepSessionAlive', !!elements.keepAliveToggle?.checked);
        Object.entries(STORAGE_FIELDS).forEach(function ([elementKey, storageConfig]) {
            if (!elements[elementKey]) return;
            if (elementKey === 'systemInstructionInput' && window.GeminiInstructionState?.setBaseInstruction) {
                window.GeminiInstructionState.setBaseInstruction(elements[elementKey].value);
                return;
            }
            safeStorageSet(storageConfig[0], elements[elementKey].value);
        });
    }

    function closeDialog(dialog) {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.style.display = 'none';
    }

    async function openDialog(elements) {
        restoreSettings(elements);
        if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
        else elements.dialog.style.display = 'grid';
        await refreshCredentialStatus(elements);
    }

    function announce(displayMessage, message) {
        if (typeof displayMessage === 'function') displayMessage(`System Message: ${message}`, true);
    }

    async function saveSettings(elements, getWebSocket, displayMessage) {
        if (elements.saveBtn.disabled) return;
        const originalLabel = elements.saveBtn.textContent;
        elements.saveBtn.disabled = true;
        elements.saveBtn.textContent = 'Saving...';

        try {
            persistSettings(elements);
            const apiKey = String(elements.apiKeyInput?.value || '').trim();
            let apiKeySyncState = '';
            if (apiKey) {
                safeStorageSet('geminiApiKey', apiKey);
                setCredentialStatus(elements, 'saving', 'Saved locally. Syncing the key into the local credential vault...');
                const workflow = window.GeminiCredentialWorkflow?.saveCredentials
                    || window.GeminiServerControl?.saveCredentials;
                if (typeof workflow !== 'function') {
                    apiKeySyncState = 'local';
                    setCredentialStatus(elements, 'missing', 'Saved locally. Start the Gemini controller to sync it into the credential vault.');
                } else {
                    try {
                        await workflow(apiKey);
                        try { localStorage.removeItem('geminiApiKey'); } catch (error) {}
                        elements.apiKeyInput.value = '';
                        apiKeySyncState = 'secured';
                        setCredentialStatus(elements, 'ready', 'API key secured. Reconnecting the Gemini workspace...');
                    } catch (error) {
                        apiKeySyncState = 'local';
                        console.warn('[SessionControls] Secure credential sync failed; local fallback kept:', error);
                        setCredentialStatus(elements, 'error', `Saved locally, but secure vault sync failed: ${error?.message || 'Unknown error'}`);
                    }
                }
            }

            const cleanupInterval = Number.parseInt(elements.cleanupInput?.value || '60', 10);
            const currentWebSocket = getWebSocket?.();
            if (currentWebSocket?.readyState === window.WebSocket?.OPEN) {
                currentWebSocket.send(JSON.stringify({
                    command: 'set_cleanup_interval',
                    interval: cleanupInterval
                }));
            }

            announce(displayMessage, apiKey
                ? (apiKeySyncState === 'secured'
                    ? 'Settings and Gemini credentials secured. Reconnecting now.'
                    : 'Settings saved. Gemini API key kept locally and will sync when the controller is available.')
                : 'Session settings saved. Model changes apply on reconnect.');
            closeDialog(elements.dialog);
        } catch (error) {
            console.error('[SessionControls] Error saving settings:', error);
            setCredentialStatus(elements, 'error', error?.message || 'Settings could not be saved.');
            announce(displayMessage, `Settings were not fully saved: ${error?.message || 'Unknown error'}`);
        } finally {
            elements.saveBtn.disabled = false;
            elements.saveBtn.textContent = originalLabel;
        }
    }

    window.SessionControlsAgentic.initializeSessionControlsSettings = function (getWebSocket, displayMessage) {
        const elements = getElements();
        if (!elements.button || !elements.dialog || !elements.saveBtn || !elements.cancelBtn) {
            console.error('[SessionControls] Required UI elements were not found.');
            return false;
        }
        if (elements.dialog.dataset.sessionControlsBound === '1') return true;
        elements.dialog.dataset.sessionControlsBound = '1';

        if (typeof elements.dialog.showModal !== 'function' && typeof dialogPolyfill !== 'undefined') {
            dialogPolyfill.registerDialog(elements.dialog);
        }

        elements.button.addEventListener('click', function () {
            openDialog(elements).catch(function (error) {
                console.error('[SessionControls] Could not open settings:', error);
                announce(displayMessage, 'Could not open Session Controls.');
            });
        });
        [elements.cancelBtn, elements.closeBtn].filter(Boolean).forEach(function (button) {
            button.addEventListener('click', function () {
                closeDialog(elements.dialog);
            });
        });
        elements.apiKeyReveal?.addEventListener('click', function () {
            const showing = elements.apiKeyInput.type === 'text';
            elements.apiKeyInput.type = showing ? 'password' : 'text';
            elements.apiKeyReveal.setAttribute('aria-pressed', String(!showing));
            elements.apiKeyReveal.setAttribute('aria-label', showing ? 'Show API key' : 'Hide API key');
            const icon = elements.apiKeyReveal.querySelector('.material-icons');
            if (icon) icon.textContent = showing ? 'visibility' : 'visibility_off';
        });
        elements.saveBtn.addEventListener('click', function () {
            saveSettings(elements, getWebSocket, displayMessage);
        });
        elements.dialog.addEventListener('cancel', function (event) {
            event.preventDefault();
            closeDialog(elements.dialog);
        });
        window.addEventListener('eve:gemini-server-status', function (event) {
            if (!elements.dialog.open) return;
            const configured = !!event.detail?.credentialsConfigured;
            if (configured) {
                setCredentialStatus(elements, 'ready', 'An API key is secured in the local Windows credential vault.');
            }
        });
        return true;
    };
})();
